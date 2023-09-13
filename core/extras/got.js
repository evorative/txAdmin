import { convars, EvoEnv } from '@core/globalData';
import got from 'got';

export default got.extend({
    timeout: {
        request: 5000
    },
    headers: {
        'User-Agent': `Evorative ${EvoEnv.EvorativeVersion}`,
    },
    localAddress: convars.forceInterface ? convars.forceInterface : undefined,
});
