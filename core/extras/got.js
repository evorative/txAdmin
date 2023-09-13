import { convars, txEnv } from '@core/globalData';
import got from 'got';

export default got.extend({
    timeout: {
        request: 5000
    },
    headers: {
        'User-Agent': `Evorative ${txEnv.txAdminVersion}`,
    },
    localAddress: convars.forceInterface ? convars.forceInterface : undefined,
});
