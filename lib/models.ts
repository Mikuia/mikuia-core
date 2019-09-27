import * as redis from 'redis';

import {Target, Targets} from 'mikuia-shared';

export class Models {
	public targets: Targets;

    constructor(private db: redis.RedisClient) {
		this.targets = new Targets(db);
	}
}