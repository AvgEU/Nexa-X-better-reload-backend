import type { Hono } from "hono";
// (removed unused import)
import fs from "node:fs";
import path from "node:path";
import { v4 as uuidv4 } from "uuid";
import getVersion from "../utils/handlers/getVersion";
import { Nexa } from "../utils/handlers/errors";

const userpath = new Set();
const profilesDir = path.join(__dirname, "..", "..", "static", "profiles");

export default function (app: Hono) {
  app.post(
    "/fortnite/api/game/v2/profile/:accountId/:type/:operation",
    async (c) => {
      const body = await c.req.json();
      let MultiUpdate: any = [];
      let Notifications: any = [];
      let profileChanges: any = [];
      let BaseRevision = 0;
      let profile: any;

      const query = c.req.query();
      const accountId = c.req.param("accountId");

      if (!query.profileId) {
        return c.text("Profile ID not found", 404);
      }

      const profileId = query.profileId;

      const accountProfilesDir = path.join(profilesDir, accountId);
      if (!fs.existsSync(accountProfilesDir)) {
        fs.mkdirSync(accountProfilesDir, { recursive: true });
      }

      const templateFiles = fs
        .readdirSync(profilesDir)
        .filter((f) => f.endsWith(".json"));

      templateFiles.forEach((file) => {
        const templatePath = path.join(profilesDir, file);
        const accountProfilePath = path.join(accountProfilesDir, file);

        if (!fs.existsSync(accountProfilePath)) {
          fs.copyFileSync(templatePath, accountProfilePath);
        }
      });

      const profilePath = path.join(
        accountProfilesDir,
        `profile_${profileId}.json`
      );

      if (!fs.existsSync(profilePath)) {
        const templatePath = path.join(
          profilesDir,
          `profile_${profileId}.json`
        );
        if (fs.existsSync(templatePath)) {
          fs.copyFileSync(templatePath, profilePath);
        } else if (templateFiles.length > 0) {
          fs.copyFileSync(
            path.join(profilesDir, templateFiles[0]),
            profilePath
          );
        } else {
          fs.writeFileSync(
            profilePath,
            JSON.stringify(
              {
                rvn: 0,
                items: {},
                stats: { attributes: {} },
                commandRevision: 0,
              },
              null,
              2
            )
          );
        }
      }

      profile = JSON.parse(fs.readFileSync(profilePath, "utf8"));
      if (!profile.rvn) profile.rvn = 0;
      if (!profile.items) profile.items = {};
      if (!profile.stats) profile.stats = {};
      if (!profile.stats.attributes) profile.stats.attributes = {};
      if (!profile.commandRevision) profile.commandRevision = 0;

      BaseRevision = profile ? profile.rvn : 0;

      switch (c.req.param("operation")) {
        case "QueryProfile":
          break;
        case "RedeemRealMoneyPurchases":
          break;
        case "SetHardcoreModifier":
          break;
        case "AthenaPinQuest":
          break;
        case "MarkNewQuestNotificationSent":
          break;
        case "SetMtxPlatform":
          break;
        case "ClientQuestLogin":
          break;
        case "RefreshExpeditions":
          break;
        case "PurchaseCatalogEntry":
          {
            const useragent: any = c.req.header("user-agent");
            if (!useragent) return c.json(Nexa.internal.invalidUserAgent);
            const ver = getVersion(c);

            const { offerId, purchaseQuantity, currency, currencySubType, expectedTotalPrice, gameContext } = await c.req.json();

            function findOffer(offerId: any) {
              let shop: any = {};
              switch (true) {
                case ver.build >= 30.1:
                  {
                    shop = JSON.parse(
                      fs.readFileSync(path.join(__dirname, "../../static/shop/v3.json"), "utf8"),
                    ); // latest
                    break;
                  }
                case ver.build >= 26.3:
                  {
                    shop = JSON.parse(
                      fs.readFileSync(path.join(__dirname, "../../static/shop/v2.json"), "utf8"),
                    );
                    break;
                  }
                default:
                  {
                    shop = JSON.parse(
                      fs.readFileSync(path.join(__dirname, "../../static/shop/v1.json"), "utf8"),
                    ); // to build 26.2
                    break;
                  }
              }

              for (let storefront of shop.storefronts) {
                let findOfferId = storefront.catalogEntries.find(
                  (i: any) => i.offerId == offerId
                );
                if (findOfferId)
                  return { name: storefront.name, offerId: findOfferId };
              }
            }

            let findOfferId = findOffer(body.offerId) as any;
            if (!findOfferId) return c.json(Nexa.storefront.invalidItem, 400);

            let notification: any = {
              type: "CatalogPurchase",
              primary: true,
              lootResult: {
                items: [],
              },
            };

            const athenaPath = path.join(accountProfilesDir, `profile_athena.json`);
            const athena = JSON.parse(fs.readFileSync(athenaPath, "utf8"));

            MultiUpdate.push({
              profileRevision: athena.rvn || 0,
              profileId: "athena",
              profileChangesBaseRevision: athena.rvn || 0,
              profileChanges: [],
              profileCommandRevision: athena.commandRevision || 0,
            });
            
            for (let value of findOfferId.offerId.itemGrants) {
              const ID = uuidv4();

              let itemExists = Object.values(athena.items).some(
                (item: any) =>
                  item && item.templateId && item.templateId.toLowerCase() === value.templateId.toLowerCase()
              );

              if (itemExists) return c.json(Nexa.storefront.alreadyOwned, 400);
              let variants: any = [];

              const Item = {
                templateId: value.templateId,
                attributes: {
                  item_seen: false,
                  variants: variants,
                },
                quantity: 1,
              };

              athena.items[ID] = Item;

              MultiUpdate[0].profileChanges.push({
                changeType: "itemAdded",
                itemId: ID,
                item: athena.items[ID],
              });

              notification.lootResult.items.push({
                itemType: Item.templateId,
                itemGuid: ID,
                itemProfile: "athena",
                quantity: 1,
              });
            }

            Notifications.push(notification);

            if (findOfferId.offerId.prices[0].currencyType.toLowerCase() === "mtxcurrency") {
              let paid = false;

              for (let key in profile.items) {
                if (!profile.items[key].templateId.toLowerCase().startsWith("currency:mtx"))
                  continue;

                let currencyPlatform = profile.items[key].attributes.platform;
                if (currencyPlatform.toLowerCase() !== profile.stats.attributes.current_mtx_platform.toLowerCase() && currencyPlatform.toLowerCase() !== "shared")
                  continue;

                if (profile.items[key].quantity < findOfferId.offerId.prices[0].finalPrice)
                  return c.json(Nexa.storefront.currencyInsufficient, 400);

                profile.items[key].quantity -= findOfferId.offerId.prices[0].finalPrice;

                profileChanges.push({
                  changeType: "itemQuantityChanged",
                  itemId: key,
                  quantity: profile.items[key].quantity,
                });

                paid = true;
                break;
              }

              if (!paid && findOfferId.offerId.prices[0].finalPrice > 0)
                return c.json(Nexa.storefront.currencyInsufficient, 400);

              if (MultiUpdate[0].profileChanges.length > 0) {
                athena.rvn += 1;
                athena.commandRevision += 1;
                athena.updated = new Date().toISOString();

                MultiUpdate[0].profileRevision = athena.rvn;
                MultiUpdate[0].profileCommandRevision = athena.commandRevision;
              }
            }

            if (profileChanges.length > 0) {
              athena.rvn += 1;
              athena.commandRevision += 1;
              athena.updated = new Date().toISOString();

              fs.writeFileSync(athenaPath, JSON.stringify(athena, null, 2));
            }

            break;
          }
        case "SetAffiliateName":
          const { affiliateName } = await c.req.json();
          profile.stats.attributes.mtx_affiliate_set_time =
            new Date().toISOString();
          profile.stats.attributes.mtx_affiliate = affiliateName;
          profileChanges.push({
            changeType: "statModified",
            name: "mtx_affiliate_set_time",
            value: profile.stats.attributes.mtx_affiliate_set_time,
          });

          profileChanges.push({
            changeType: "statModified",
            name: "mtx_affiliate",
            value: profile.stats.attributes.mtx_affiliate,
          });
          profile.rvn += 1;
          profile.commandRevision += 1;
          break;
        case "SetCosmeticLockerBanner": // br banner 2
          profile.stats.attributes.banner_icon = body.homebaseBannerIconId;
          profile.stats.attributes.banner_color = body.homebaseBannerColorId;

          profileChanges.push({
            changeType: "statModified",
            name: "banner_icon",
            value: profile.stats.attributes.banner_icon,
          });

          profileChanges.push({
            changeType: "statModified",
            name: "banner_color",
            value: profile.stats.attributes.banner_color,
          });
          profile.rvn += 1;
          profile.commandRevision += 1;
          break;
        case "SetBattleRoyaleBanner": // br banner 1
          profile.stats.attributes.banner_icon = body.homebaseBannerIconId;
          profile.stats.attributes.banner_color = body.homebaseBannerColorId;

          profileChanges.push({
            changeType: "statModified",
            name: "banner_icon",
            value: profile.stats.attributes.banner_icon,
          });

          profileChanges.push({
            changeType: "statModified",
            name: "banner_color",
            value: profile.stats.attributes.banner_color,
          });
          profile.rvn += 1;
          profile.commandRevision += 1;
          break;
        case "EquipBattleRoyaleCustomization": // br locker 1
          let statName;
          let itemToSlot;
          let itemToSlotID = body.itemToSlot;

          switch (body.slotName) {
            case "Character":
              statName = "favorite_character";
              itemToSlot = body.itemToSlot;
              profile.stats.attributes[statName] = itemToSlot;
              profileChanges.push({
                changeType: "statModified",
                name: statName,
                value: profile.stats.attributes[statName],
              });
              break;
            case "Backpack":
              statName = "favorite_backpack";
              itemToSlot = body.itemToSlot;
              profile.stats.attributes[statName] = itemToSlot;
              profileChanges.push({
                changeType: "statModified",
                name: statName,
                value: profile.stats.attributes[statName],
              });
              break;
            case "Pickaxe":
              statName = "favorite_pickaxe";
              itemToSlot = body.itemToSlot;
              profile.stats.attributes[statName] = itemToSlot;
              profileChanges.push({
                changeType: "statModified",
                name: statName,
                value: profile.stats.attributes[statName],
              });
              break;
            case "Glider":
              statName = "favorite_glider";
              itemToSlot = body.itemToSlot;
              profile.stats.attributes[statName] = itemToSlot;
              profileChanges.push({
                changeType: "statModified",
                name: statName,
                value: profile.stats.attributes[statName],
              });
              break;
            case "SkyDiveContrail":
              statName = "favorite_skydivecontrail";
              itemToSlot = body.itemToSlot;
              profile.stats.attributes[statName] = itemToSlot;
              profileChanges.push({
                changeType: "statModified",
                name: statName,
                value: profile.stats.attributes[statName],
              });
              break;
            case "MusicPack":
              statName = "favorite_musicpack";
              itemToSlot = body.itemToSlot;
              profile.stats.attributes[statName] = itemToSlot;
              profileChanges.push({
                changeType: "statModified",
                name: statName,
                value: profile.stats.attributes[statName],
              });
              break;
            case "LoadingScreen":
              statName = "favorite_loadingscreen";
              itemToSlot = body.itemToSlot;
              profile.stats.attributes[statName] = itemToSlot;
              profileChanges.push({
                changeType: "statModified",
                name: statName,
                value: profile.stats.attributes[statName],
              });
              break;
            case "Dance":
            case "ItemWrap":
              const bIsDance = body.slotName === "Dance";
              statName = bIsDance ? "favorite_dance" : "favorite_itemwraps";
              let arr = profile.stats.attributes[statName] || [];
              if (body.indexWithinSlot === -1) {
                arr = [];
                for (let i = 0; i < (bIsDance ? 6 : 7); ++i) {
                  arr[i] = body.itemToSlot;
                }
              } else {
                arr[body.indexWithinSlot || 0] = body.itemToSlot;
              }
              for (let i = 0; i < arr.length; ++i) {
                if (arr[i] == null) {
                  arr[i] = "";
                }
              }
              profile.stats.attributes[statName] = arr;
              profileChanges.push({
                changeType: "statModified",
                name: statName,
                value: profile.stats.attributes[statName],
              });
              break;
            default:
              break;
          }
          let Variants = body.variantUpdates;
          if (Array.isArray(Variants)) {
            if (!profile.items[itemToSlotID]) {
              profile.items[itemToSlotID] = { attributes: { variants: [] } };
            }
            for (let i in Variants) {
              if (typeof Variants[i] != "object") continue;
              if (!Variants[i].channel) continue;
              if (!Variants[i].active) continue;

              let index = profile.items[
                itemToSlotID
              ].attributes.variants.findIndex(
                (x: any) => x.channel == Variants[i].channel
              );

              if (index === -1) {
                profile.items[itemToSlotID].attributes.variants.push({
                  channel: Variants[i].channel,
                  active: Variants[i].active,
                  owned: Variants[i].owned || [],
                });
              } else {
                profile.items[itemToSlotID].attributes.variants[index].active =
                  Variants[i].active;
              }
            }

            profileChanges.push({
              changeType: "itemAttrChanged",
              itemId: itemToSlotID,
              attributeName: "variants",
              attributeValue: profile.items[itemToSlotID].attributes.variants,
            });
          }
          profile.rvn += 1;
          profile.commandRevision += 1;
          break;
        case "SetCosmeticLockerSlot": // br locker 2
          if (body.category && body.lockerItem && body.itemToSlot) {
            let itemToSlot = body.itemToSlot;
            let itemToSlotID = "";

            if (body.itemToSlot) {
              for (let itemId in profile.items) {
                if (profile.items[itemId]?.templateId?.toLowerCase() == body.itemToSlot.toLowerCase()) {
                  itemToSlotID = itemId;
                  break;
                }
              }
            }

            let Variants = body.variantUpdates;
            if (Array.isArray(Variants) && itemToSlotID) {
              if (!profile.items[itemToSlotID]) {
                profile.items[itemToSlotID] = { attributes: { variants: [] } };
              }

              for (let i in Variants) {
                if (typeof Variants[i] != "object") continue;
                if (!Variants[i].channel) continue;
                if (!Variants[i].active) continue;

                if (profile.items[itemToSlotID]) {
                  let item = profile.items[itemToSlotID];
                  if (!item.attributes.variants) item.attributes.variants = [];

                  let index = item.attributes.variants.findIndex(
                    (x: any) => x.channel == Variants[i].channel
                  );

                  if (index == -1) {
                    item.attributes.variants.push({
                      channel: Variants[i].channel,
                      active: Variants[i].active,
                      owned: Variants[i].owned || []
                    });
                  } else {
                    item.attributes.variants[index].active = Variants[i].active;
                  }
                }
              }

              profileChanges.push({
                changeType: "itemAttrChanged",
                itemId: itemToSlotID,
                attributeName: "variants",
                attributeValue: profile.items[itemToSlotID] ? profile.items[itemToSlotID].attributes.variants : [],
              });
            }

            switch (body.category) {
              case "Character":
                profile.items[
                  body.lockerItem
                ].attributes.locker_slots_data.slots.Character.items = [
                    itemToSlot,
                  ];
                profile.stats.attributes.favorite_character = itemToSlotID || itemToSlot;
                break;
              case "Backpack":
                profile.items[
                  body.lockerItem
                ].attributes.locker_slots_data.slots.Backpack.items = [
                    itemToSlot,
                  ];
                profile.stats.attributes.favorite_backpack = itemToSlotID || itemToSlot;
                break;
              case "Pickaxe":
                profile.items[
                  body.lockerItem
                ].attributes.locker_slots_data.slots.Pickaxe.items = [
                    itemToSlot,
                  ];
                profile.stats.attributes.favorite_pickaxe = itemToSlotID || itemToSlot;
                break;
              case "Glider":
                profile.items[
                  body.lockerItem
                ].attributes.locker_slots_data.slots.Glider.items = [
                    itemToSlot,
                  ];
                profile.stats.attributes.favorite_glider = itemToSlotID || itemToSlot;
                break;
              case "SkyDiveContrail":
                profile.items[
                  body.lockerItem
                ].attributes.locker_slots_data.slots.SkyDiveContrail.items = [
                    itemToSlot,
                  ];
                profile.stats.attributes.favorite_skydivecontrail = itemToSlotID || itemToSlot;
                break;
              case "MusicPack":
                profile.items[
                  body.lockerItem
                ].attributes.locker_slots_data.slots.MusicPack.items = [
                    itemToSlot,
                  ];
                profile.stats.attributes.favorite_musicpack = itemToSlotID || itemToSlot;
                break;
              case "LoadingScreen":
                profile.items[
                  body.lockerItem
                ].attributes.locker_slots_data.slots.LoadingScreen.items = [
                    itemToSlot,
                  ];
                profile.stats.attributes.favorite_loadingscreen = itemToSlotID || itemToSlot;
                break;
              case "Dance":
                const indexWithinSlot = body.slotIndex || 0;
                if (indexWithinSlot >= 0 && indexWithinSlot <= 5) {
                  profile.items[
                    body.lockerItem
                  ].attributes.locker_slots_data.slots.Dance.items[
                    indexWithinSlot
                  ] = itemToSlot;

                  if (!profile.stats.attributes.favorite_dance) profile.stats.attributes.favorite_dance = [];
                  profile.stats.attributes.favorite_dance[indexWithinSlot] = itemToSlotID || itemToSlot;
                }
                break;
              case "ItemWrap":
                const indexWithinWrap = body.slotIndex || 0;
                if (indexWithinWrap >= 0) {
                  if (indexWithinWrap <= 7) {
                    profile.items[
                      body.lockerItem
                    ].attributes.locker_slots_data.slots.ItemWrap.items[
                      indexWithinWrap
                    ] = itemToSlot;

                    if (!profile.stats.attributes.favorite_itemwraps) profile.stats.attributes.favorite_itemwraps = [];
                    profile.stats.attributes.favorite_itemwraps[indexWithinWrap] = itemToSlotID || itemToSlot;
                  } else if (indexWithinWrap == -1) {
                    for (let i = 0; i < 7; i++) {
                      profile.items[
                        body.lockerItem
                      ].attributes.locker_slots_data.slots.ItemWrap.items[i] = itemToSlot;

                      if (!profile.stats.attributes.favorite_itemwraps) profile.stats.attributes.favorite_itemwraps = [];
                      profile.stats.attributes.favorite_itemwraps[i] = itemToSlotID || itemToSlot;
                    }
                  }
                }
                break;
              default:
                break;
            }

            profile.rvn += 1;
            profile.commandRevision += 1;

            profileChanges.push({
              changeType: "itemAttrChanged",
              itemId: body.lockerItem,
              attributeName: "locker_slots_data",
              attributeValue:
                profile.items[body.lockerItem].attributes.locker_slots_data,
            });
          }
          break;
        case "ClaimMfaEnabled":
          break;
        case "PutModularCosmeticLoadout": // br locker 3
          const { loadoutType, presetId, loadoutData } = await c.req.json();
          if (!profile.stats.attributes.hasOwnProperty("loadout_presets")) {
            profile.stats.attributes.loadout_presets = {};

            profileChanges.push({
              changeType: "statModified",
              name: "loadout_presets",
              value: {},
            });
          }

          if (
            !profile.stats.attributes.loadout_presets.hasOwnProperty(
              loadoutType
            )
          ) {
            const newLoadout = uuidv4();

            profile.items[newLoadout] = {
              templateId: loadoutType,
              attributes: {},
              quantity: 1,
            };

            profileChanges.push({
              changeType: "itemAdded",
              itemId: newLoadout,
              item: profile.items[newLoadout],
            });

            profile.stats.attributes.loadout_presets[loadoutType] = {
              [presetId]: newLoadout,
            };

            profileChanges.push({
              changeType: "statModified",
              name: "loadout_presets",
              value: profile.stats.attributes.loadout_presets,
            });
          }

          const loadoutID =
            profile.stats.attributes.loadout_presets[loadoutType][presetId];
          if (profile.items[loadoutID]) {
            profile.items[loadoutID].attributes = JSON.parse(loadoutData);

            profileChanges.push({
              changeType: "itemAttrChanged",
              itemId: loadoutID,
              attributeName: "slots",
              attributeValue: profile.items[loadoutID].attributes.slots,
            });
          }
          break;
        default:
          break;
      }

      profileChanges.push({
        changeType: "fullProfileUpdate",
        profile: profile,
      });

      fs.writeFileSync(profilePath, JSON.stringify(profile, null, 2));

      const response = {
        profileRevision: profile ? profile.rvn || 0 : 0,
        profileId: query.profileId,
        profileChangesBaseRevision: BaseRevision,
        profileChanges: profileChanges,
        notifications: Notifications,
        profileCommandRevision: profile ? profile.commandRevision || 0 : 0,
        serverTime: new Date().toISOString(),
        multiUpdate: MultiUpdate,
        responseVersion: 1,
      };

      userpath.add(profileId);

      return c.json(response);
    }
  );
}
