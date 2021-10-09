import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {MaticAddresses} from "../../../MaticAddresses";
import {startDefaultLpStrategyTest} from "../../DefaultLpStrategyTest";
import {readFileSync} from "fs";
import {Settings} from "../../../../settings";
import {startDefaultSingleTokenStrategyTest} from "../../DefaultSingleTokenStrategyTest";


const {expect} = chai;
chai.use(chaiAsPromised);

describe('Universal Wault tests', async () => {
  if (Settings.disableStrategyTests) {
    return;
  }
  const infos = readFileSync('scripts/utils/download/data/wault_pools.csv', 'utf8').split(/\r?\n/);

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

    if (+alloc <= 0 || idx === 'idx' || idx === '0' || !lpAddress) {
      console.log('skip', idx);
      return;
    }
    if (Settings.onlyOneWaultStrategyTest && +strat[0] !== Settings.onlyOneWaultStrategyTest) {
      return;
    }

    console.log('strat', idx, lpName);


    if (strat[6]) {
      /* tslint:disable:no-floating-promises */
      startDefaultLpStrategyTest(
          'StrategyWaultLp',
          MaticAddresses.WAULT_FACTORY,
          lpAddress.toLowerCase(),
          token0,
          token0Name,
          token1,
          token1Name,
          idx,
          [MaticAddresses.WEXpoly_TOKEN]
      );
    } else {
      /* tslint:disable:no-floating-promises */
      startDefaultSingleTokenStrategyTest(
          'StrategyWaultSingle',
          MaticAddresses.WAULT_FACTORY,
          lpAddress.toLowerCase(),
          token0,
          token0Name,
          idx,
          [MaticAddresses.WEXpoly_TOKEN]
      );
    }
  });


});
