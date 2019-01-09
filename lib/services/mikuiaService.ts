import {Target} from '../target';

export interface MikuiaService {
	connect();
	handleResponse(event: object, data: object);
	join(target: Target);
	start();
}
