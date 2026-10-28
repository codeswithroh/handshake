// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {AgenticCommerce} from "../AgenticCommerce.sol";

/**
 * @title Deploy
 * @notice Deploys AgenticCommerce using a Foundry keystore account.
 *         Never pass a raw private key on the command line.
 *
 * Usage (Arc Mainnet, keystore account):
 *
 *   forge script contracts/script/Deploy.s.sol:Deploy \
 *     --rpc-url https://rpc.mainnet.arc.io \
 *     --account <keystore-account-name> \
 *     --with-gas-price 25gwei \
 *     --broadcast \
 *     -vvvv
 *
 * Usage (Arc Testnet, keystore account):
 *
 *   forge script contracts/script/Deploy.s.sol:Deploy \
 *     --rpc-url https://rpc.testnet.arc.io \
 *     --account <keystore-account-name> \
 *     --with-gas-price 25gwei \
 *     --broadcast \
 *     -vvvv
 *
 * Constructor args are read from environment variables so they never appear
 * in shell history. Set them before running:
 *
 *   export USDC_ADDRESS=0x3600000000000000000000000000000000000000
 *   export EVALUATOR_FEE_BPS=1000
 *
 * See DEPLOY.md for the full setup walkthrough.
 */
contract Deploy is Script {
    function run() external {
        address usdc = vm.envAddress("USDC_ADDRESS");
        uint16  feeBps = uint16(vm.envUint("EVALUATOR_FEE_BPS"));

        console2.log("Deploying AgenticCommerce");
        console2.log("  usdc            :", usdc);
        console2.log("  evaluatorFeeBps :", feeBps);

        vm.startBroadcast();
        AgenticCommerce ac = new AgenticCommerce(usdc, feeBps);
        vm.stopBroadcast();

        console2.log("Deployed to:", address(ac));
    }
}
