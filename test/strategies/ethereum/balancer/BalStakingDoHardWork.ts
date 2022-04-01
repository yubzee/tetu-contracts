import {DoHardWorkLoopBase} from "../../DoHardWorkLoopBase";
import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {utils} from "ethers";
import {TokenUtils} from "../../../TokenUtils";
import {StrategyTestUtils} from "../../StrategyTestUtils";
import {EthAddresses} from "../../../../scripts/addresses/EthAddresses";
import {BalDepositor__factory, StrategyBalStaking__factory} from "../../../../typechain";

const {expect} = chai;
chai.use(chaiAsPromised);


export class BalStakingDoHardWork extends DoHardWorkLoopBase {

  public async loopStartActions(i: number) {
    await super.loopStartActions(i);

    // todo remove after develop claims

    const ppfsBefore = await this.vault.getPricePerFullShare();
    console.log('ppfs before transfer', ppfsBefore.toString());
    await TokenUtils.getToken(EthAddresses.BAL_TOKEN, this.strategy.address, utils.parseUnits('1000'))
    const ppfsAfter = await this.vault.getPricePerFullShare();
    console.log('ppfs after transfer', ppfsAfter.toString());
    expect(ppfsBefore).is.eq(ppfsAfter);
  }


  public async loopEndActions(i: number) {
    console.log('loopEndActions - no withdraw actions')
  }

  public async doHardWork() {
    const depositorAdr = await StrategyBalStaking__factory.connect(this.strategy.address, this.signer).depositor()
    const depositor = BalDepositor__factory.connect(depositorAdr, this.signer);
    console.log('HW DEPOSITOR', depositor.address);
    await depositor.claimAndMoveToAnotherChain();
  }

  protected async postLoopCheck() {

    await this.vault.connect(this.signer).getAllRewards();
    await this.vault.connect(this.user).getAllRewards();

    // strategy should not contain any tokens in the end
    const stratRtBalances = await StrategyTestUtils.saveStrategyRtBalances(this.strategy);
    for (const rtBal of stratRtBalances) {
      expect(rtBal).is.eq(0, 'Strategy contains not liquidated rewards');
    }

    // check vault balance
    const vaultBalanceAfter = await TokenUtils.balanceOf(this.core.psVault.address, this.vault.address);
    expect(vaultBalanceAfter.sub(this.vaultRTBal)).is.not.eq("0", "vault reward should increase");

    // check ps balance
    const psBalanceAfter = await TokenUtils.balanceOf(this.core.rewardToken.address, this.core.psVault.address);
    expect(psBalanceAfter.sub(this.psBal)).is.not.eq("0", "ps balance should increase");

    // check reward for user
    const rewardBalanceAfter = await TokenUtils.balanceOf(this.core.psVault.address, this.user.address);
    expect(rewardBalanceAfter.sub(this.userRTBal).toString())
      .is.not.eq("0", "should have earned xTETU rewards");
  }

}
