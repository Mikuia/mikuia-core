import {TwitchStream} from '../models/twitchStream';

export interface TwitchGetLiveStreamsResponse {
	_total: number,
    streams: Array<TwitchStream>
}