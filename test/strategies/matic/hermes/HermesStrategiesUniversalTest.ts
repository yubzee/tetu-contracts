import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {MaticAddresses} from "../../../MaticAddresses";
import {startDefaultLpStrategyTest} from "../../DefaultLpStrategyTest";
import {readFileSync} from "fs";
import {Settings} from "../../../../settings";


chai.use(chaiAsPromised);

describe.skip('Universal Hermes tests', async () => {
  if (Settings.disableStrategyTests) {
    return;
  }
  const infos = readFileSync('scripts/utils/download/data/hermes_pools.csv', 'utf8').split(/\r?\n/);

  infos.forEach(info => {

    const strat = info.split(',');

    const idx = strat[0];
    const lpName = strat[1];
    const lpAddress = strat[2];
    const token0 = strat[3];
    const token0Name = strat[4];
    const token1 = strat[5];
    const token1Name = strat[6];
    const alloc = strat[7];

    if (+alloc <= 0 || idx === 'idx' || !token1Name) {
      console.log('skip', idx);
      return;
    }
    if (Settings.onlyOneHermesStrategyTest && +strat[0] !== Settings.onlyOneHermesStrategyTest) {
      return;
    }

    console.log('strat', idx, lpName);

    /* tslint:disable:no-floating-promises */
    startDefaultLpStrategyTest(
        'StrategyHermesSwapLp',
        MaticAddresses.QUICK_FACTORY,
        lpAddress.toLowerCase(),
        token0,
        token0Name,
        token1,
        token1Name,
        idx,
        [MaticAddresses.IRIS_TOKEN]
    );
  });


});
