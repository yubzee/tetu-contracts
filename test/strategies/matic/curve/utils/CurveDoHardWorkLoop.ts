import {expect} from "chai";
import {MaticAddresses} from "../../../../MaticAddresses";
import {utils} from "ethers";
import {ethers} from "hardhat";
import {TokenUtils} from "../../../../TokenUtils";
import {StrategyInfo} from "../../../StrategyInfo";
import {TimeUtils} from "../../../../TimeUtils";
import {StrategyTestUtils} from "../../../StrategyTestUtils";
import {VaultUtils} from "../../../../VaultUtils";
import {ICurveStrategy, IGauge} from "../../../../../typechain";

export class CurveDoHardWorkLoop {

  public static async doHardWorkWithLiqPath(strategyInfo: StrategyInfo, swap: (() => Promise<void>) | null) {
    const undDec = await TokenUtils.decimals(strategyInfo.underlying);
    const bbRatio = (await strategyInfo.strategy.buyBackRatio()).toNumber();
    // tslint:disable-next-line
    // @ts-ignore
    const gaugeAddress = await (strategyInfo.strategy as ICurveStrategy).gauge();
    const vaultForUser = strategyInfo.vault.connect(strategyInfo.user);

    const xTetu = (await vaultForUser.rewardTokens())[0];
    const undBal = await TokenUtils.balanceOf(strategyInfo.underlying, strategyInfo.user.address)
    const userUnderlyingBalance = +utils.formatUnits(undBal, undDec);

    await VaultUtils.deposit(strategyInfo.user, strategyInfo.vault, undBal);

    const rewardBalanceBefore = await TokenUtils.balanceOf(strategyInfo.core.psVault.address, strategyInfo.user.address);
    const vaultBalanceBefore = await TokenUtils.balanceOf(strategyInfo.core.psVault.address, strategyInfo.vault.address);
    const psBalanceBefore = await TokenUtils.balanceOf(strategyInfo.core.rewardToken.address, strategyInfo.core.psVault.address);
    const userEarnedTotalxTetu = await strategyInfo.core.bookkeeper.userEarned(strategyInfo.user.address, strategyInfo.vault.address, xTetu);

    if (swap) {
      await swap();
    }

    await StrategyTestUtils.updatePSRatio(strategyInfo.core.announcer, strategyInfo.core.controller, 500, 1000, 60 * 60 * 24 * 2)

    const sevenDays = 7 * 24 * 60 * 60;
    await TimeUtils.advanceBlocksOnTs(sevenDays);

    // we need to call claimable_reward_write to checkpoint rewards (curve mechanic)
    const gaugeContract = await ethers.getContractAt("IGauge", gaugeAddress) as IGauge;

    await gaugeContract.claimable_reward_write(strategyInfo.strategy.address, MaticAddresses.WMATIC_TOKEN);
    await gaugeContract.claimable_reward_write(strategyInfo.strategy.address, MaticAddresses.CRV_TOKEN);

    const totalToClaim = await StrategyTestUtils.calculateTotalToClaim(strategyInfo.calculator,
      strategyInfo.strategy, strategyInfo.core.rewardToken);

    await VaultUtils.doHardWorkAndCheck(strategyInfo.vault);

    const earned = +utils.formatUnits(await strategyInfo.core.bookkeeper.targetTokenEarned(strategyInfo.strategy.address));
    console.log('earned', earned, totalToClaim);

    expect(earned).is.approximately(totalToClaim, totalToClaim * 2); // very approximately
    await StrategyTestUtils.checkStrategyRewardsBalance(strategyInfo.strategy, ['0', '0']);

    if (bbRatio > 1000) {
      // check vault balance
      const vaultBalanceAfter = await TokenUtils.balanceOf(strategyInfo.core.psVault.address, strategyInfo.vault.address);
      expect(vaultBalanceAfter.sub(vaultBalanceBefore)).is.not.eq("0", "vault reward should increase");
      // check ps balance
      const psBalanceAfter = await TokenUtils.balanceOf(strategyInfo.core.rewardToken.address, strategyInfo.core.psVault.address);
      expect(psBalanceAfter.sub(psBalanceBefore)).is.not.eq("0", "ps balance should increase");
      // check reward for user
      await TimeUtils.advanceBlocksOnTs(sevenDays); // 1 week
      await vaultForUser.getAllRewards();
      const rewardBalanceAfter = await TokenUtils.balanceOf(strategyInfo.core.psVault.address, strategyInfo.user.address);
      expect(rewardBalanceAfter.sub(rewardBalanceBefore).toString()).is.not.eq("0", "should have earned iToken rewards");

      const userEarnedTotalAfterRt0 = await strategyInfo.core.bookkeeper.userEarned(strategyInfo.user.address, strategyInfo.vault.address, xTetu);
      console.log('user total earned xTetu', +utils.formatUnits(userEarnedTotalxTetu),
        +utils.formatUnits(userEarnedTotalAfterRt0), +utils.formatUnits(userEarnedTotalAfterRt0) - +utils.formatUnits(userEarnedTotalxTetu))
      expect(+utils.formatUnits(userEarnedTotalAfterRt0)).is.greaterThan(+utils.formatUnits(userEarnedTotalxTetu));
    }

    // ************* EXIT ***************
    await strategyInfo.strategy.emergencyExit();
    await vaultForUser.exit();
    const userUnderlyingBalanceAfter = +utils.formatUnits(await TokenUtils.balanceOf(strategyInfo.underlying, strategyInfo.user.address), undDec);
    expect(userUnderlyingBalanceAfter).is.greaterThan(userUnderlyingBalance, "should have more");
  };
}
