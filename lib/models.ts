import * as redis from 'redis';

import {Channel} from './channel';

export class Models {

    constructor(private db: redis.RedisClient) {}
    
    getChannel(id: number, type: string) {
        return new Channel(id, type, this.db);
    }

}