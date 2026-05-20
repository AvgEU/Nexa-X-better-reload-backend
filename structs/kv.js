const Keyv = require('keyv');

const Use_Redis = false;
const memkv = new Keyv();
let redis = null;
if (Use_Redis) {
  const Redis = require('ioredis');
  redis = new Redis();
}

class KV {
    async get(key) {
        if (Use_Redis && redis) {
            return await redis.get(key);
        } else {
            return await memkv.get(key);
        }
    }

    async set(key, value) {
        if (Use_Redis && redis) {
            const set = await redis.set(key, value);
            return set === 'OK';
        } else {
            const set = await memkv.set(key, value);
            return set;
        }
    }

    async setTTL(key, value, ttl) {
        if (Use_Redis && redis) {
            const set = await redis.set(key, value, 'EX', ttl);
            return set === 'OK';
        } else {
            const set = await memkv.set(key, value, ttl);
            return set;
        }
    }
}

module.exports = new KV();