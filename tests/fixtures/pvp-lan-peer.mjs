// A separate Node process exercises the same transport used by the Electron host.
import { IP2LivePVPService } from '../../deployment/windows/pvp-service.js';

let offset = 0;
const service = new IP2LivePVPService({ discoveryPort: 0, httpPort: 0, clock: () => Date.now() + offset });
process.on('message', async ({ id, operation, input }) => {
    try {
        let value;
        if (operation === 'transport') value = { discoveryPort: service.udp.address().port, httpPort: service.port };
        else if (operation === 'advance') { offset += input; value = true; }
        else {
            if (operation === 'discover') service.discoveryPort = input.discoveryPort;
            value = await service[operation](input);
        }
        process.send({ id, value });
    } catch (error) { process.send({ id, error: error.message }); }
});
process.on('disconnect', async () => { await service.close(); });
