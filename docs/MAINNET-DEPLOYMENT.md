# Live Arc mainnet deployment

Chain 5042; production receipts checked on 2026-10-14. Testnet records are retained separately.

| Contract | Mainnet address |
|---|---|
| cbtc | [0x171A4217b86A807A64eB94757Db6849fb4bDbAA0](https://explorer.arc.io/address/0x171A4217b86A807A64eB94757Db6849fb4bDbAA0) |
| ccipRouter | [0xB79791184973589c38e114D43Eb8E4588C283A18](https://explorer.arc.io/address/0xB79791184973589c38e114D43Eb8E4588C283A18) |
| council | [0x1d628d3C6588Fe1AC7234C08EB2D4Ea2A4a16E55](https://explorer.arc.io/address/0x1d628d3C6588Fe1AC7234C08EB2D4Ea2A4a16E55) |
| delegation | [0x83d58219484EB94cFaDFe4D975393c13051B36b1](https://explorer.arc.io/address/0x83d58219484EB94cFaDFe4D975393c13051B36b1) |
| eurc | [0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1](https://explorer.arc.io/address/0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1) |
| identityRegistry | [0x8004A169FB4a3325136EB29fA0ceB6D2e539a432](https://explorer.arc.io/address/0x8004A169FB4a3325136EB29fA0ceB6D2e539a432) |
| memo | [0x5294E9927c3306DcBaDb03fe70b92e01cCede505](https://explorer.arc.io/address/0x5294E9927c3306DcBaDb03fe70b92e01cCede505) |
| priceGuard | [0x301536E42A40CF723e2a4948630D731Da732cd5A](https://explorer.arc.io/address/0x301536E42A40CF723e2a4948630D731Da732cd5A) |
| quoter | [0x7DfD4F31be6814D2906BDE155c3e1B146EAc1468](https://explorer.arc.io/address/0x7DfD4F31be6814D2906BDE155c3e1B146EAc1468) |
| reputationRegistry | [0x8004BAa17C55a88189AE136b182e5fdA19dE9b63](https://explorer.arc.io/address/0x8004BAa17C55a88189AE136b182e5fdA19dE9b63) |
| stopReceiver | [0x77329D679CE9c17543821575C6D3681A672cff7A](https://explorer.arc.io/address/0x77329D679CE9c17543821575C6D3681A672cff7A) |
| usyc | [0x8a5D989Bbb96929F689B0200f435f53dA42bF490](https://explorer.arc.io/address/0x8a5D989Bbb96929F689B0200f435f53dA42bF490) |
| v2Factory | [0x0000000000000000000000000000000000000000](https://explorer.arc.io/address/0x0000000000000000000000000000000000000000) |
| venue | [0x53BF6B0684Ec7eF91e1387Da3D1a1769bC5A6F77](https://explorer.arc.io/address/0x53BF6B0684Ec7eF91e1387Da3D1a1769bC5A6F77) |
| venueRegistry | [0x391eEB248ED9311057CFBfA7E218310281cfe4fa](https://explorer.arc.io/address/0x391eEB248ED9311057CFBfA7E218310281cfe4fa) |
| weth | [0x128cC466B61f542da60c70e3aA11c10e19B84EDB](https://explorer.arc.io/address/0x128cC466B61f542da60c70e3aA11c10e19B84EDB) |

## Transactions

- CREATE XorrPriceGuard : [0xc722f2d8ff695bfcb4fcab26ea5d67aa7cd2a885fd75a29fb622fa3eeea3b102](https://explorer.arc.io/tx/0xc722f2d8ff695bfcb4fcab26ea5d67aa7cd2a885fd75a29fb622fa3eeea3b102); status 1; gas 0.0215105400 USDC.
- CALL XorrPriceGuard listFeed(address,address,uint32): [0xb5830502864edbf4c1af3700e761c58a151e20c5601cb7465c392fe5a6481fbc](https://explorer.arc.io/tx/0xb5830502864edbf4c1af3700e761c58a151e20c5601cb7465c392fe5a6481fbc); status 1; gas 0.0027363800 USDC.
- CALL XorrPriceGuard listFeed(address,address,uint32): [0x4d03ac43bb4df6f7ad239323036402b21ba7a7f236e41bff7e5e1b6eee328ab3](https://explorer.arc.io/tx/0x4d03ac43bb4df6f7ad239323036402b21ba7a7f236e41bff7e5e1b6eee328ab3); status 1; gas 0.0023980400 USDC.
- CALL XorrPriceGuard listFeed(address,address,uint32): [0xa09ccac83f0ec223b8014f81749f66a88d4c3e7ba5f2533f2a3b1331062585a1](https://explorer.arc.io/tx/0xa09ccac83f0ec223b8014f81749f66a88d4c3e7ba5f2533f2a3b1331062585a1); status 1; gas 0.0025740600 USDC.
- CALL XorrPriceGuard listFeed(address,address,uint32): [0x42e44d659edcd329cd37e175060964a9104a6141ad1e0e68c1215b1e6bbba1b8](https://explorer.arc.io/tx/0x42e44d659edcd329cd37e175060964a9104a6141ad1e0e68c1215b1e6bbba1b8); status 1; gas 0.0023980400 USDC.
- CREATE XorrVenueRegistry : [0x2e7620e6c32463647de9f39e603dfca6ba38646a9810f6c5fd804ea77aa5d9c3](https://explorer.arc.io/tx/0x2e7620e6c32463647de9f39e603dfca6ba38646a9810f6c5fd804ea77aa5d9c3); status 1; gas 0.0206426200 USDC.
- CREATE XorrCouncil : [0xa59e50f968ae6c74c7d67ae2d2b4fc154f387ff8b37a27433376f629e7f3a3de](https://explorer.arc.io/tx/0xa59e50f968ae6c74c7d67ae2d2b4fc154f387ff8b37a27433376f629e7f3a3de); status 1; gas 0.0381497200 USDC.
- CREATE XorrDelegation : [0xded210267d3d2955d1e835493ab7ef91146c32696d5b807dd5e7b11a1a69a532](https://explorer.arc.io/tx/0xded210267d3d2955d1e835493ab7ef91146c32696d5b807dd5e7b11a1a69a532); status 1; gas 0.0478746400 USDC.
- CALL XorrCouncil setDelegation(address): [0x39a59945dfe3b17d1fdea17cdc8f94f52999c78ec20381ec8600cc4b42022f59](https://explorer.arc.io/tx/0x39a59945dfe3b17d1fdea17cdc8f94f52999c78ec20381ec8600cc4b42022f59); status 1; gas 0.0009529600 USDC.
- CALL XorrCouncil setRecorder(address,bool): [0x093e86a1846f6a17fe17fceb8522812e43dc48015e384f8475961f7e5a0b4436](https://explorer.arc.io/tx/0x093e86a1846f6a17fe17fceb8522812e43dc48015e384f8475961f7e5a0b4436); status 1; gas 0.0009559000 USDC.
- CALL  register(string): [0x9876bd9fd8ba02a8dff7f7d89539c3cf4bc50389baaccce0b95035009e936e69](https://explorer.arc.io/tx/0x9876bd9fd8ba02a8dff7f7d89539c3cf4bc50389baaccce0b95035009e936e69); status 1; gas 0.0072413000 USDC.
- CALL XorrCouncil setSeat(uint8,uint256): [0x1195d6ef946446c4ecbfd50fddc76c5f84a4764eeb942840d2a0b109747e3590](https://explorer.arc.io/tx/0x1195d6ef946446c4ecbfd50fddc76c5f84a4764eeb942840d2a0b109747e3590); status 1; gas 0.0012920400 USDC.
- CALL  register(string): [0x925c2942d6a40f543583600796b1f2730558c33ff1deca2fa03e6a5b5d9272c7](https://explorer.arc.io/tx/0x925c2942d6a40f543583600796b1f2730558c33ff1deca2fa03e6a5b5d9272c7); status 1; gas 0.0073563400 USDC.
- CALL XorrCouncil setSeat(uint8,uint256): [0x98991ee96f1a06233c658f85ce142e2df9545625bb7bf46143680c1cfce48b9e](https://explorer.arc.io/tx/0x98991ee96f1a06233c658f85ce142e2df9545625bb7bf46143680c1cfce48b9e); status 1; gas 0.0012922800 USDC.
- CALL  register(string): [0xc76affffc33a1f52ef1f08ba26d97676196d0dee7dedd69a3816d7db7a04a80c](https://explorer.arc.io/tx/0xc76affffc33a1f52ef1f08ba26d97676196d0dee7dedd69a3816d7db7a04a80c); status 1; gas 0.0064418000 USDC.
- CALL XorrCouncil setSeat(uint8,uint256): [0xc79587101394a42f95ced5772706ae84905f630a52818cc639c3823480844df9](https://explorer.arc.io/tx/0xc79587101394a42f95ced5772706ae84905f630a52818cc639c3823480844df9); status 1; gas 0.0012922800 USDC.
- CALL  register(string): [0xeab712db34b22f0e2b0aeef8dd3e95cfbad452fb472bc3a23d8890b2c107a094](https://explorer.arc.io/tx/0xeab712db34b22f0e2b0aeef8dd3e95cfbad452fb472bc3a23d8890b2c107a094); status 1; gas 0.0068976200 USDC.
- CALL XorrCouncil setSeat(uint8,uint256): [0x00e650ac00d851c79a315a44a1a449b55ea22d4a417d363545a9cda38d7200f8](https://explorer.arc.io/tx/0x00e650ac00d851c79a315a44a1a449b55ea22d4a417d363545a9cda38d7200f8); status 1; gas 0.0012922800 USDC.
- CALL  register(string): [0x1d6561e884b82d6a734b17e5885dcd8e6d3dfec86a689b25f90ab2444598b02e](https://explorer.arc.io/tx/0x1d6561e884b82d6a734b17e5885dcd8e6d3dfec86a689b25f90ab2444598b02e); status 1; gas 0.0068964200 USDC.
- CALL XorrCouncil setSeat(uint8,uint256): [0x1eeba8c4d199177bfd91aeb43839da26b7cdd9f0119fc1400352bd519076ce4f](https://explorer.arc.io/tx/0x1eeba8c4d199177bfd91aeb43839da26b7cdd9f0119fc1400352bd519076ce4f); status 1; gas 0.0012922800 USDC.
- CREATE XorrStopReceiver : [0xc0af7382cfc3e13820796464b5736f394ec700a7e3e2040a40a2c7b0b8c33034](https://explorer.arc.io/tx/0xc0af7382cfc3e13820796464b5736f394ec700a7e3e2040a40a2c7b0b8c33034); status 1; gas 0.0225676800 USDC.
- Offer venueRegistry to Safe: [0x8044a754082c053a2cdcfeee37a8feed5235a2d77242a5f3095d3da2f237d4fc](https://explorer.arc.io/tx/0x8044a754082c053a2cdcfeee37a8feed5235a2d77242a5f3095d3da2f237d4fc); status 1; gas 0.0010038630 USDC.
- Safe accepts venueRegistry: [0xe939200f13f7f0cb1634bb43a7ac431085e58cff38b4905efaa16e76c9486038](https://explorer.arc.io/tx/0xe939200f13f7f0cb1634bb43a7ac431085e58cff38b4905efaa16e76c9486038); status 1; gas 0.0013931610 USDC.
- Offer priceGuard to Safe: [0xbef629e96844ab15129e53235677d5a1a6636a4ddc09c44da7d2c9eec2893284](https://explorer.arc.io/tx/0xbef629e96844ab15129e53235677d5a1a6636a4ddc09c44da7d2c9eec2893284); status 1; gas 0.0010061730 USDC.
- Safe accepts priceGuard: [0x67ce41979691abb9ec93224461d3b76bb3b9e2d8f189de94a887a702b140a3bb](https://explorer.arc.io/tx/0x67ce41979691abb9ec93224461d3b76bb3b9e2d8f189de94a887a702b140a3bb); status 1; gas 0.0013959330 USDC.
- Offer council to Safe: [0xc71a9e2c2fa041fd074fbfd44f613786fe77b9e4d07684a3efb94e0d6002ca03](https://explorer.arc.io/tx/0xc71a9e2c2fa041fd074fbfd44f613786fe77b9e4d07684a3efb94e0d6002ca03); status 1; gas 0.0010110870 USDC.
- Safe accepts council: [0x7f748a4647fab2716641e5fd40e14daf18a60026b5c59aa31ce2104b65cbd26a](https://explorer.arc.io/tx/0x7f748a4647fab2716641e5fd40e14daf18a60026b5c59aa31ce2104b65cbd26a); status 1; gas 0.0013943790 USDC.
- service float XORR_EXECUTOR 1: [0x7b68e786b65dab3b408752ed08b2722d6ab6514ffaedb0d57f0141e4adb8d553](https://explorer.arc.io/tx/0x7b68e786b65dab3b408752ed08b2722d6ab6514ffaedb0d57f0141e4adb8d553); status 1; gas 0.0004410000 USDC.
- Smoke: grant bounded 0.1 USDC permission (no trade): [0x37955e8e29f48209b76600b490c5f144864e5b409f91df00a6e1d89e0d60ad05](https://explorer.arc.io/tx/0x37955e8e29f48209b76600b490c5f144864e5b409f91df00a6e1d89e0d60ad05); status 1; gas 0.0045469410 USDC.
- Smoke: revoke permission immediately: [0x55b1f456cae7f08b74d2b2a431560b232884ac95ab6f2fcb34247204766d1617](https://explorer.arc.io/tx/0x55b1f456cae7f08b74d2b2a431560b232884ac95ab6f2fcb34247204766d1617); status 1; gas 0.0009597840 USDC.

Total recorded project gas: 0.2172075410 USDC.

Mainnet smoke is script-driven; hosted mainnet browser transactions and cross-chain delivery are Not run. Public testnet proof remains separately labelled. Production role keys are outside this repository.

Permission grant and revoke are Live mainnet. Mainnet trading and council settlement are Not run. Source verification was attempted; the API returned a Cloudflare challenge.
