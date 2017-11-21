import * as redis from 'redis';

import {Channel} from '../channel';
import {Settings} from '../settings';

export interface MikuiaService {
	connect();
	handleResponse(event: object, data: object);
	join(channel: Channel);
	start();
}
