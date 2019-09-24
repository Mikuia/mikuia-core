import * as redis from 'redis';

import {Target} from 'mikuia-shared';

export class Models {

    constructor(private db: redis.RedisClient) {}
    
    getTarget(service: string, serviceId: string) {
        return new Target(service, serviceId, this.db);
    }

}