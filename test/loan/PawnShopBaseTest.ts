import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {ethers} from "hardhat";
import {CoreContractsWrapper} from "../CoreContractsWrapper";
import {TimeUtils} from "../TimeUtils";
import {DeployerUtils} from "../../scripts/deploy/DeployerUtils";
import {MockNFT, TetuPawnShop} from "../../typechain";
import {MaticAddresses} from "../MaticAddresses";
import {UniswapUtils} from "../UniswapUtils";
import {utils} from "ethers";
import {TokenUtils} from "../TokenUtils";
import {PawnShopTestUtils} from "./PawnShopTestUtils";
import {MintHelperUtils} from "../MintHelperUtils";

const {expect} = chai;
chai.use(chaiAsPromised);

describe("Tetu pawnshop base tests", function () {
  let snapshotBefore: string;
  let snapshot: string;
  let signer: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;
  let user3: SignerWithAddress;
  let core: CoreContractsWrapper;
  let shop: TetuPawnShop;
  let nft: MockNFT;

  before(async function () {
    snapshotBefore = await TimeUtils.snapshot();
    signer = (await ethers.getSigners())[0];
    user1 = (await ethers.getSigners())[1];
    user2 = (await ethers.getSigners())[2];
    user3 = (await ethers.getSigners())[3];
    core = await DeployerUtils.deployAllCoreContracts(signer, 1, 1);

    shop = await DeployerUtils.deployContract(signer, 'TetuPawnShop', core.controller.address, core.rewardToken.address) as TetuPawnShop;
    nft = await DeployerUtils.deployContract(signer, 'MockNFT') as MockNFT;

    await shop.setPositionDepositToken(core.rewardToken.address);

    await core.feeRewardForwarder.setConversionPath(
        [MaticAddresses.USDC_TOKEN, core.rewardToken.address],
        [MaticAddresses.QUICK_ROUTER]
    );

    await core.feeRewardForwarder.setLiquidityNumerator(50);
    await core.feeRewardForwarder.setLiquidityRouter(MaticAddresses.QUICK_ROUTER);

    await nft.mint(user1.address);
    await nft.mint(user1.address);
    await nft.mint(user2.address);

    await MintHelperUtils.mint(core.controller, core.announcer, '100000', user1.address);
    await UniswapUtils.buyToken(user1, MaticAddresses.SUSHI_ROUTER, MaticAddresses.WMATIC_TOKEN, utils.parseUnits('500000'));
    await UniswapUtils.buyToken(user1, MaticAddresses.SUSHI_ROUTER, MaticAddresses.USDC_TOKEN, utils.parseUnits('2000'));
    await UniswapUtils.buyToken(user2, MaticAddresses.SUSHI_ROUTER, MaticAddresses.WMATIC_TOKEN, utils.parseUnits('500000'));
    await UniswapUtils.buyToken(user2, MaticAddresses.SUSHI_ROUTER, MaticAddresses.USDC_TOKEN, utils.parseUnits('2000'));
    await UniswapUtils.buyToken(user3, MaticAddresses.SUSHI_ROUTER, MaticAddresses.WMATIC_TOKEN, utils.parseUnits('500000'));
    await UniswapUtils.buyToken(user3, MaticAddresses.SUSHI_ROUTER, MaticAddresses.USDC_TOKEN, utils.parseUnits('2000'));

    await UniswapUtils.buyToken(signer, MaticAddresses.SUSHI_ROUTER, MaticAddresses.WMATIC_TOKEN, utils.parseUnits('500000'));
    await UniswapUtils.buyToken(signer, MaticAddresses.SUSHI_ROUTER, MaticAddresses.USDC_TOKEN, utils.parseUnits('2000'));
    await MintHelperUtils.mint(core.controller, core.announcer, '100000', signer.address)
    await UniswapUtils.addLiquidity(
        signer,
        core.rewardToken.address,
        MaticAddresses.USDC_TOKEN,
        utils.parseUnits('50', 18).toString(),
        utils.parseUnits('255', 6).toString(),
        MaticAddresses.QUICK_FACTORY,
        MaticAddresses.QUICK_ROUTER
    );
    await TokenUtils.approve(core.rewardToken.address, user1, shop.address, utils.parseUnits('10000').toString());
  });

  after(async function () {
    await TimeUtils.rollback(snapshotBefore);
  });


  beforeEach(async function () {
    snapshot = await TimeUtils.snapshot();
  });

  afterEach(async function () {
    await TimeUtils.rollback(snapshot);
  });

  it("open multiple positions with close", async () => {
    const collateralToken = MaticAddresses.WMATIC_TOKEN;

    for (let i = 0; i < 3; i++) {
      await PawnShopTestUtils.openErc20ForUsdcAndCheck(
          user1,
          shop,
          collateralToken,
          '10' + i,
          '555' + i,
          99 + i,
          10 + i
      );

      if (i !== 0 && i % 2 === 0) {
        await PawnShopTestUtils.closeAndCheck(i - 1, user1, shop);
      }
    }
  });

  it("bid on position with instant execution", async () => {
    const collateralToken = MaticAddresses.WMATIC_TOKEN;

    const acquiredAmount = utils.parseUnits('55', 6).toString();
    const id = await PawnShopTestUtils.openErc20ForUsdcAndCheck(
        user1,
        shop,
        collateralToken,
        utils.parseUnits('10').toString(),
        acquiredAmount,
        0,
        0
    );

    await PawnShopTestUtils.bidAndCheck(id, acquiredAmount, user2, shop)
  });

  it("bid on position and claim", async () => {
    const collateralToken = MaticAddresses.WMATIC_TOKEN;

    const acquiredAmount = utils.parseUnits('55', 6).toString();
    const id = await PawnShopTestUtils.openErc20ForUsdcAndCheck(
        user1,
        shop,
        collateralToken,
        '10',
        acquiredAmount,
        1,
        0
    );

    await PawnShopTestUtils.bidAndCheck(id, acquiredAmount, user2, shop);
    await TimeUtils.advanceNBlocks(2);
    await PawnShopTestUtils.claimAndCheck(id, user2, shop);
  });

  it("open position and redeem", async () => {
    const collateralToken = MaticAddresses.WMATIC_TOKEN;

    const acquiredAmount = utils.parseUnits('55', 6).toString();
    const id = await PawnShopTestUtils.openErc20ForUsdcAndCheck(
        user1,
        shop,
        collateralToken,
        '10',
        acquiredAmount,
        1,
        0
    );
    await PawnShopTestUtils.bidAndCheck(id, acquiredAmount, user2, shop);
    await PawnShopTestUtils.redeemAndCheck(id, user1, shop);
  });

  it("start auction and claim", async () => {

    const id = await PawnShopTestUtils.openErc20ForUsdcAndCheck(
        user1,
        shop,
        MaticAddresses.WMATIC_TOKEN,
        '10',
        '0',
        1,
        0
    );

    await PawnShopTestUtils.bidAndCheck(id, '555', user2, shop);

    await TokenUtils.approve(MaticAddresses.USDC_TOKEN, user3, shop.address, '555');
    await expect(shop.connect(user3).bid(id, '555')).rejectedWith('TL: New bid lower than previous');

    await PawnShopTestUtils.bidAndCheck(id, '556', user3, shop);

    const bidId2 = await PawnShopTestUtils.getBidIdAndCheck(id, user2.address, shop);
    const bidId3 = await PawnShopTestUtils.getBidIdAndCheck(id, user3.address, shop);

    await expect(shop.connect(user3).closeAuctionBid(bidId3)).rejectedWith("TL: Auction is not ended");

    await PawnShopTestUtils.closeAuctionBidAndCheck(bidId2.toNumber(), user2, shop)

    await TimeUtils.advanceBlocksOnTs(60 * 60 * 24 * 2);

    await PawnShopTestUtils.acceptAuctionBidAndCheck(id, user1, shop);

    await TimeUtils.advanceNBlocks(2);

    await PawnShopTestUtils.claimAndCheck(id, user3, shop);
  });

  it("start auction and redeem", async () => {

    const id = await PawnShopTestUtils.openErc20ForUsdcAndCheck(
        user1,
        shop,
        MaticAddresses.WMATIC_TOKEN,
        '10',
        '0',
        1,
        0
    );

    await TimeUtils.advanceBlocksOnTs(60 * 60 * 24 * 2);

    await PawnShopTestUtils.bidAndCheck(id, '555', user2, shop);

    await TimeUtils.advanceBlocksOnTs(60 * 60 * 24 * 2);

    await PawnShopTestUtils.acceptAuctionBidAndCheck(id, user1, shop);

    await PawnShopTestUtils.redeemAndCheck(id, user1, shop);
  });

  it("start auction and close", async () => {

    const id = await PawnShopTestUtils.openErc20ForUsdcAndCheck(
        user1,
        shop,
        MaticAddresses.WMATIC_TOKEN,
        '10',
        '0',
        1,
        0
    );

    await PawnShopTestUtils.bidAndCheck(id, '555', user2, shop);

    const bidId2 = await PawnShopTestUtils.getBidIdAndCheck(id, user2.address, shop);

    await PawnShopTestUtils.closeAndCheck(id, user1, shop);

    await PawnShopTestUtils.closeAuctionBidAndCheck(bidId2.toNumber(), user2, shop)
  });

  it("start auction with instant deal", async () => {

    const id = await PawnShopTestUtils.openErc20ForUsdcAndCheck(
        user1,
        shop,
        MaticAddresses.WMATIC_TOKEN,
        '10',
        '0',
        0,
        0
    );

    await TimeUtils.advanceBlocksOnTs(60 * 60 * 24 * 2);

    await PawnShopTestUtils.bidAndCheck(id, '555', user2, shop);

    await TimeUtils.advanceBlocksOnTs(60 * 60 * 24 * 2);

    await PawnShopTestUtils.acceptAuctionBidAndCheck(id, user1, shop);
  });

  // ! ** NFT **************

  it("NFT bid on position with instant execution", async () => {
    const acquiredAmount = utils.parseUnits('55', 6).toString();
    const id = await PawnShopTestUtils.openNftForUsdcAndCheck(
        user1,
        shop,
        nft.address,
        '1',
        acquiredAmount,
        0,
        0
    );

    await PawnShopTestUtils.bidAndCheck(id, acquiredAmount, user2, shop)
  });

  it("NFT bid on position and claim", async () => {
    const acquiredAmount = utils.parseUnits('55', 6).toString();
    const id = await PawnShopTestUtils.openNftForUsdcAndCheck(
        user1,
        shop,
        nft.address,
        '1',
        acquiredAmount,
        1,
        0
    );

    await PawnShopTestUtils.bidAndCheck(id, acquiredAmount, user2, shop);
    await TimeUtils.advanceNBlocks(2);
    await PawnShopTestUtils.claimAndCheck(id, user2, shop);
  });

  it("NFT open position and redeem", async () => {
    const acquiredAmount = utils.parseUnits('55', 6).toString();
    const id = await PawnShopTestUtils.openNftForUsdcAndCheck(
        user1,
        shop,
        nft.address,
        '1',
        acquiredAmount,
        1,
        0
    );
    await PawnShopTestUtils.bidAndCheck(id, acquiredAmount, user2, shop);
    await PawnShopTestUtils.redeemAndCheck(id, user1, shop);
  });

});
