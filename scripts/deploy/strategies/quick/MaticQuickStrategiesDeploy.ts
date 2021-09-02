import {ethers} from "hardhat";
import {DeployerUtils} from "../../DeployerUtils";
import {readFileSync} from "fs";
import {ContractReader, Controller, IStrategy, VaultController} from "../../../../typechain";


async function main() {
  const signer = (await ethers.getSigners())[0];
  const core = await DeployerUtils.getCoreAddresses();
  const tools = await DeployerUtils.getToolsAddresses();

  const controller = await DeployerUtils.connectContract(signer, "Controller", core.controller) as Controller;
  const vaultController = await DeployerUtils.connectContract(signer, "VaultController", core.vaultController) as VaultController;

  const infos = readFileSync('scripts/utils/download/data/quick_pools.csv', 'utf8').split(/\r?\n/);

  const deployed = [];
  const vaultNames = new Set<string>();

  const cReader = await DeployerUtils.connectContract(
      signer, "ContractReader", tools.reader) as ContractReader;

  const deployedVaultAddresses = await cReader.vaults();
  console.log('all vaults size', deployedVaultAddresses.length);

  for (let vAdr of deployedVaultAddresses) {
    vaultNames.add(await cReader.vaultName(vAdr));
  }

  for (let info of infos) {
    const strat = info.split(',');

    const ids = strat[0];
    const lp_name = strat[1];
    const lp_address = strat[2];
    const token0 = strat[3];
    const token0_name = strat[4];
    const token1 = strat[5];
    const token1_name = strat[6];
    const pool = strat[7];
    const duration = strat[9];

    if (+duration <= 0 || !token0 || ids === 'idx') {
      console.log('skip', ids);
      continue;
    }

    const vaultNameWithoutPrefix = `QUICK_${token0_name}_${token1_name}`;

    if (vaultNames.has('TETU_' + vaultNameWithoutPrefix)) {
      console.log('Strategy already exist', vaultNameWithoutPrefix);
      continue;
    }

    console.log('strat', ids, lp_name);

    const data = await DeployerUtils.deployAndInitVaultAndStrategy(
        vaultNameWithoutPrefix,
        vaultAddress => DeployerUtils.deployContract(
            signer,
            'StrategyQuickSwapLp',
            core.controller,
            vaultAddress,
            lp_address,
            token0,
            token1,
            pool
        ) as Promise<IStrategy>,
        controller,
        vaultController,
        core.psVault,
        signer,
        60 * 60 * 24 * 28,
        true
    );
    data.push([
      core.controller,
      data[1].address,
      lp_address,
      token0,
      token1,
      pool
    ]);
    deployed.push(data);
  }

  await DeployerUtils.wait(5);

  for (let data of deployed) {
    await DeployerUtils.verify(data[0].address);
    await DeployerUtils.verifyWithArgs(data[1].address, [data[0].address]);
    await DeployerUtils.verifyProxy(data[1].address);
    await DeployerUtils.verifyWithArgs(data[2].address, data[3]);

  }
}


main()
.then(() => process.exit(0))
.catch(error => {
  console.error(error);
  process.exit(1);
});
