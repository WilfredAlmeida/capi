import { Router, Request, Response } from "express";
import axios, { HttpStatusCode } from "axios";

import { Keypair, LAMPORTS_PER_SOL, clusterApiUrl } from "@solana/web3.js";
import {
  ValidDepthSizePair,
  getConcurrentMerkleTreeAccountSize,
} from "@solana/spl-account-compression";
import {
  MetadataArgs,
  TokenProgramVersion,
  TokenStandard,
} from "@metaplex-foundation/mpl-bubblegum";
import { CreateMetadataAccountArgsV3 } from "@metaplex-foundation/mpl-token-metadata";

// import custom helpers for demos
import {
  loadKeypairFromFile,
  loadOrGenerateKeypair,
  numberFormatter,
  printConsoleSeparator,
  savePublicKeyToFile,
} from "../utils/helpers";

// import custom helpers to mint compressed NFTs
import {
  createCollection,
  createTree,
  mintCompressedNFT,
} from "../utils/compression";

// local import of the connection wrapper, to help with using the ReadApi
import { WrapperConnection } from "../ReadApi/WrapperConnection";

import dotenv from "dotenv";
import { PublicKey } from "@metaplex-foundation/js";
import { body } from "express-validator";
import { handleInvalidInput } from "../middleware/invalidInputHandler";
import { HttpResponseCode } from "../utils/constants";
import { logger } from "../logger";
import {
  uploadImagesToSupabase,
  uploadJsonMetadataToSupabase,
} from "../utils/fileUpload";
import { RequestBody } from "../interfaces/request";
import verifyApiKey from "../middleware/apiKeyVerification";
import supabase from "../db/supabase";
import { json } from "stream/consumers";
dotenv.config();

const router = Router();

// define some reusable balance values for tracking
let initBalance: number, balance: number;

router.post(
  "/mint",
  verifyApiKey,
  [
    body("collection.nftCount")
      .trim()
      .escape()
      .notEmpty()
      .isInt()
      .withMessage("Invalid nftCount"),
    body("collection.mintAllTo")
      .trim()
      .escape()
      .notEmpty()
      .isString()
      .withMessage("Invalid mintAllTo"),
    body("collection.collectionName")
      .trim()
      .escape()
      .notEmpty()
      .isString()
      .withMessage("Invalid collectionName"),
    body("collection.collectionSymbol")
      .trim()
      .escape()
      .notEmpty()
      .isString()
      .withMessage("Invalid collectionSymbol"),
    body("collection.collectionImage")
      .trim()
      .notEmpty()
      .isString()
      .withMessage("Invalid collectionImage"),
    body("nft.*.name")
      .trim()
      .escape()
      .notEmpty()
      .isString()
      .withMessage("Invalid name"),
    body("nft.*.symbol")
      .trim()
      .escape()
      .notEmpty()
      .isString()
      .withMessage("Invalid symbol"),
    body("nft.*.description")
      .trim()
      .escape()
      .notEmpty()
      .isString()
      .withMessage("Invalid description"),
    body("nft.*.receiver")
      .optional({ nullable: true })
      .trim()
      .escape()
      .notEmpty()
      .isString()
      .withMessage("Invalid receiver"),
    body("nft.*.image")
      .trim()
      .notEmpty()
      .isString()
      .withMessage("Invalid image"),
  ],
  handleInvalidInput,
  async (req: Request, res: Response) => {
    const { collection, nft } = req.body as RequestBody;

    const nftMetadataUrls = [];

    for (let i = 0; i < nft.length; i++) {
      const imageUrl = await uploadImagesToSupabase(nft[i].image);
      logger.info(imageUrl);

      const jsonMetaData = {
        name: nft[i].name,
        symbol: nft[i].symbol,
        description: nft[i].description,
        image: imageUrl,
      };

      const metadataUrl = await uploadJsonMetadataToSupabase(
        JSON.stringify(jsonMetaData),
      );
      nftMetadataUrls.push(metadataUrl);
    }

    let collectionImageUrl = null;
    if (collection.collectionImage) {
      collectionImageUrl = await uploadImagesToSupabase(
        collection.collectionImage,
      );
    }

    const collectionMetadata = {
      name: collection.collectionName,
      symbol: collection.collectionSymbol,
      image: collectionImageUrl,
    };

    const collectionMetadataUrl = await uploadJsonMetadataToSupabase(
      JSON.stringify(collectionMetadata),
    );

    const neededMaxDepth = calculateMaxDepth(collection.nftCount);

    // Check if the user has sufficient quota
    // TODO: Set this 300 as per allowed quota
    if (neededMaxDepth >= 300) {
      return res.status(HttpResponseCode.BAD_REQUEST).json({
        data: null,
        error: [
          {
            code: "",
            message: "nftCount not allowed",
          },
        ],
      });
    }
    logger.info(neededMaxDepth as 5);

    // generate a new keypair for use in this demo (or load it locally from the filesystem when available)
    const payer = process.env?.LOCAL_PAYER_JSON_ABSPATH
      ? loadKeypairFromFile(process.env?.LOCAL_PAYER_JSON_ABSPATH)
      : loadOrGenerateKeypair("payer");

    console.log("Payer address:", payer.publicKey.toBase58());
    // console.log("Test wallet address:", testWallet.publicKey.toBase58());
    // console.log("Mint to address:", mintToPublicKey);

    // load the env variables and store the cluster RPC url
    const CLUSTER_URL = process.env.RPC_URL ?? clusterApiUrl("devnet");

    // create a new rpc connection, using the ReadApi wrapper
    const connection = new WrapperConnection(CLUSTER_URL, "confirmed");

    // get the payer's starting balance
    initBalance = await connection.getBalance(payer.publicKey);
    console.log(
      "Starting account balance:",
      numberFormatter(initBalance / LAMPORTS_PER_SOL),
      "SOL\n",
    );

    const maxDepthSizePair: ValidDepthSizePair = {
      // max=8 nodes
      maxDepth: neededMaxDepth as 3,
      maxBufferSize: 8,
    };

    const canopyDepth = Math.abs(maxDepthSizePair.maxDepth - 5);

    // calculate the space available in the tree
    const requiredSpace = getConcurrentMerkleTreeAccountSize(
      maxDepthSizePair.maxDepth,
      maxDepthSizePair.maxBufferSize,
      canopyDepth,
    );

    const storageCost = await connection.getMinimumBalanceForRentExemption(
      requiredSpace,
    );

    // demonstrate data points for compressed NFTs
    console.log("Space to allocate:", numberFormatter(requiredSpace), "bytes");
    console.log(
      "Estimated cost to allocate space:",
      numberFormatter(storageCost / LAMPORTS_PER_SOL),
    );
    console.log(
      "Max compressed NFTs for tree:",
      numberFormatter(Math.pow(2, maxDepthSizePair.maxDepth)),
      "\n",
    );

    // ensure the payer has enough balance to create the allocate the Merkle tree
    if (initBalance < storageCost) {
      console.error("Not enough SOL to allocate the merkle tree");
      printConsoleSeparator();

      return res.status(HttpResponseCode.INTERNAL_SERVER_ERROR).json({
        data: null,
        errors: [
          {
            message: "Not enough SOL to allocate the merkle tree. Donate some.",
          },
        ],
      });
    }

    // define the address the tree will live at
    const treeKeypair = Keypair.generate();

    // create and send the transaction to create the tree on chain
    const tree = await createTree(
      connection,
      payer,
      treeKeypair,
      maxDepthSizePair,
      canopyDepth,
    );

    // define the metadata to be used for creating the NFT collection
    const collectionMetadataV3: CreateMetadataAccountArgsV3 = {
      data: {
        name: collection.collectionName,
        symbol: collection.collectionSymbol,
        // specific json metadata for the collection
        uri: collectionMetadataUrl,
        sellerFeeBasisPoints: 100,
        creators: [
          {
            address: payer.publicKey,
            verified: false,
            share: 100,
          },
        ], // or set to `null`
        collection: null,
        uses: null,
      },
      isMutable: true,
      collectionDetails: null,
    };

    // create a full token mint and initialize the collection (with the `payer` as the authority)
    const nftCollection = await createCollection(
      connection,
      payer,
      collectionMetadataV3,
    );

    const compressedNFTMetadataList = [];
    const mintToPublicKeys: PublicKey[] = [];

    /// TODO: Adjust this as per your business logic
    const collectionCreators = [
      {
        address: payer.publicKey,
        //   address: testWallet.publicKey,
        verified: false,
        share: 100,
      },
    ];

    for (let i = 0; i < nft.length; i++) {
      compressedNFTMetadataList.push({
        name: nft[i].name,
        symbol: collectionMetadataV3.data.symbol,
        // specific json metadata for each NFT
        uri: nftMetadataUrls[i],
        creators: [
          {
            address: payer.publicKey,
            //   address: testWallet.publicKey,
            verified: false,
            share: 100,
          },
        ], // or set to null
        editionNonce: 0,
        uses: null,
        nftCollection: null,
        primarySaleHappened: false,
        sellerFeeBasisPoints: 0,
        isMutable: true,
        // these values are taken from the Bubblegum package
        tokenProgramVersion: TokenProgramVersion.Original,
        tokenStandard: TokenStandard.NonFungible,
        collection: null,
      });

      let mintToPublicKey;
      try {
        mintToPublicKey = nft[i].receiver
          ? new PublicKey(nft[i].receiver!)
          : new PublicKey(collection.mintAllTo!);
      } catch (err) {
        logger.error(err);
        return res.status(HttpResponseCode.BAD_REQUEST).json({
          data: null,
          error: [{ message: "Invalid mintTo public key" }],
        });
      }

      mintToPublicKeys.push(mintToPublicKey);
    }

    // const compressedNFTMetadata: MetadataArgs = {
    //   name: "CNFT Name",
    //   symbol: collectionMetadataV3.data.symbol,
    //   // specific json metadata for each NFT
    //   uri: "https://supersweetcollection.notarealurl/token.json",
    //   creators: [
    //     {
    //       address: mintToPublicKey,
    //       //   address: testWallet.publicKey,
    //       verified: false,
    //       share: 100,
    //     },
    //   ], // or set to null
    //   editionNonce: 0,
    //   uses: null,
    //   nftCollection: null,
    //   primarySaleHappened: false,
    //   sellerFeeBasisPoints: 0,
    //   isMutable: true,
    //   // these values are taken from the Bubblegum package
    //   tokenProgramVersion: TokenProgramVersion.Original,
    //   tokenStandard: TokenStandard.NonFungible,
    // };


    let collectionId;
    try{

      const dbRes1 = await supabase.from("collection").insert({
        user_id: req.user?.userId,
        name: collection.collectionName,
        symbol: collection.collectionSymbol,
        image_url: collectionMetadata.image,
        uri_url: collectionMetadataUrl,
        mint: nftCollection.mint,
        token_account: nftCollection.tokenAccount,
        metadata_account: nftCollection.metadataAccount,
        master_edition_account: nftCollection.masterEditionAccount,
        seller_fee_basis_points: 100,
        creators: collectionCreators,
        uses: null,
        mutable: null,
        collection_details: null
      }).select("collection_id")


      collectionId = dbRes1.data?.[0]?.['collection_id'];

      const dbRes2 = await supabase.from("keypair").insert({
        public_key: treeKeypair.publicKey,
        secret_key: treeKeypair.secretKey
      }).select("keypair_id")


      const keypairId = dbRes2.data?.[0]?.['keypair_id'];

      await supabase.from("tree").insert({
        collection_id: collectionId,
        max_depth: maxDepthSizePair.maxDepth,
        canopy_depth: canopyDepth,
        payer: payer.publicKey,
        storage_cost: storageCost,
        keypair: keypairId
      })

    }
    catch(err){
      logger.error(err)
      return res.status(HttpStatusCode.InternalServerError).json({error: err});
    }


    const txSignatures = await mintCompressedNFT(
      connection,
      payer,
      treeKeypair.publicKey,
      nftCollection.mint,
      nftCollection.metadataAccount,
      nftCollection.masterEditionAccount,
      compressedNFTMetadataList,
      // mint to this specific wallet (in this case, the tree owner aka `payer`)
      mintToPublicKeys,
    );

    const dbr = await supabase.from("mints").insert({
      user_id: req.user?.userId,
      collection_id: collectionId,
      transaction_signatures: txSignatures
    })
    logger.info(JSON.stringify(dbr))

    // fully mint a single compressed NFT to the payer
    console.log(
      `Minting a single compressed NFT to ${payer.publicKey.toBase58()}...`,
    );

    return res.status(HttpResponseCode.SUCCESS).json({signatures: txSignatures})

    // (async () => {
    //     //////////////////////////////////////////////////////////////////////////////
    //     //////////////////////////////////////////////////////////////////////////////

    //     // generate a new Keypair for testing, named `wallet`
    //     // const testWallet = loadOrGenerateKeypair("testWallet");
    //     // const testWallet = new PublicKey("lala")
    //     // const testWallet = new PublicKey("AoJSKnWPyFg5MPDtCcP3Nb4FdGjAJuozyEgauAVjhrZc")

    //     // generate a new keypair for use in this demo (or load it locally from the filesystem when available)
    //     const payer = process.env?.LOCAL_PAYER_JSON_ABSPATH
    //         ? loadKeypairFromFile(process.env?.LOCAL_PAYER_JSON_ABSPATH)
    //         : loadOrGenerateKeypair("payer");

    //     console.log("Payer address:", payer.publicKey.toBase58());
    //     // console.log("Test wallet address:", testWallet.publicKey.toBase58());
    //     console.log("Mint to address:", mintToPublicKey);

    //     // locally save the addresses for the demo
    //     // savePublicKeyToFile("userAddress", payer.publicKey);
    //     // savePublicKeyToFile("testWallet", mintToPublicKey);
    //     // savePublicKeyToFile("testWallet", testWallet.publicKey);

    //     //////////////////////////////////////////////////////////////////////////////
    //     //////////////////////////////////////////////////////////////////////////////

    //     // load the env variables and store the cluster RPC url
    //     const CLUSTER_URL = process.env.RPC_URL ?? clusterApiUrl("devnet");

    //     // create a new rpc connection, using the ReadApi wrapper
    //     const connection = new WrapperConnection(CLUSTER_URL, "confirmed");

    //     //////////////////////////////////////////////////////////////////////////////
    //     //////////////////////////////////////////////////////////////////////////////

    //     // get the payer's starting balance
    //     initBalance = await connection.getBalance(payer.publicKey);
    //     console.log(
    //         "Starting account balance:",
    //         numberFormatter(initBalance / LAMPORTS_PER_SOL),
    //         "SOL\n",
    //     );

    //     //////////////////////////////////////////////////////////////////////////////
    //     //////////////////////////////////////////////////////////////////////////////

    //     /*
    //       Define our tree size parameters
    //     */
    //     const maxDepthSizePair: ValidDepthSizePair = {
    //         // max=8 nodes
    //         maxDepth: neededMaxDepth as 3,
    //         maxBufferSize: 8,

    //         // max=16,384 nodes
    //         //   maxDepth: 14,
    //         //   maxBufferSize: 64,

    //         // max=131,072 nodes
    //         // maxDepth: 17,
    //         // maxBufferSize: 64,

    //         // max=1,048,576 nodes
    //         // maxDepth: 20,
    //         // maxBufferSize: 256,

    //         // max=1,073,741,824 nodes
    //         // maxDepth: 30,
    //         // maxBufferSize: 2048,
    //     };
    //     const canopyDepth = maxDepthSizePair.maxDepth - 5;

    //     //////////////////////////////////////////////////////////////////////////////
    //     //////////////////////////////////////////////////////////////////////////////

    //     /*
    //       For demonstration purposes, we can compute how much space our tree will
    //       need to allocate to store all the records. As well as the cost to allocate
    //       this space (aka minimum balance to be rent exempt)
    //       ---
    //       NOTE: These are performed automatically when using the `createAllocTreeIx`
    //       function to ensure enough space is allocated, and rent paid.
    //     */

    //     // calculate the space available in the tree
    //     const requiredSpace = getConcurrentMerkleTreeAccountSize(
    //         maxDepthSizePair.maxDepth,
    //         maxDepthSizePair.maxBufferSize,
    //         canopyDepth,
    //     );

    //     const storageCost = await connection.getMinimumBalanceForRentExemption(requiredSpace);

    //     // demonstrate data points for compressed NFTs
    //     console.log("Space to allocate:", numberFormatter(requiredSpace), "bytes");
    //     console.log("Estimated cost to allocate space:", numberFormatter(storageCost / LAMPORTS_PER_SOL));
    //     console.log(
    //         "Max compressed NFTs for tree:",
    //         numberFormatter(Math.pow(2, maxDepthSizePair.maxDepth)),
    //         "\n",
    //     );

    //     // ensure the payer has enough balance to create the allocate the Merkle tree
    //     if (initBalance < storageCost) return console.error("Not enough SOL to allocate the merkle tree");
    //     printConsoleSeparator();

    //     //////////////////////////////////////////////////////////////////////////////
    //     //////////////////////////////////////////////////////////////////////////////

    //     /*
    //       Actually allocate the tree on chain
    //     */

    //     // define the address the tree will live at
    //     const treeKeypair = Keypair.generate();

    //     // create and send the transaction to create the tree on chain
    //     const tree = await createTree(connection, payer, treeKeypair, maxDepthSizePair, canopyDepth);

    //     // locally save the addresses for the demo
    //     savePublicKeyToFile("treeAddress", tree.treeAddress);
    //     savePublicKeyToFile("treeAuthority", tree.treeAuthority);

    //     //////////////////////////////////////////////////////////////////////////////
    //     //////////////////////////////////////////////////////////////////////////////

    //     /*
    //       Create the actual NFT collection (using the normal Metaplex method)
    //       (nothing special about compression here)
    //     */

    //     // define the metadata to be used for creating the NFT collection
    //     const collectionMetadataV3: CreateMetadataAccountArgsV3 = {
    //         data: {
    //             name: "Super Sweet NFT Collection",
    //             symbol: "SSNC",
    //             // specific json metadata for the collection
    //             uri: "https://supersweetcollection.notarealurl/collection.json",
    //             sellerFeeBasisPoints: 100,
    //             creators: [
    //                 {
    //                     address: payer.publicKey,
    //                     verified: false,
    //                     share: 100,
    //                 },
    //             ], // or set to `null`
    //             collection: null,
    //             uses: null,
    //         },
    //         isMutable: false,
    //         collectionDetails: null,
    //     };

    //     // create a full token mint and initialize the collection (with the `payer` as the authority)
    //     const collection = await createCollection(connection, payer, collectionMetadataV3);

    //     // locally save the addresses for the demo
    //     savePublicKeyToFile("collectionMint", collection.mint);
    //     savePublicKeyToFile("collectionMetadataAccount", collection.metadataAccount);
    //     savePublicKeyToFile("collectionMasterEditionAccount", collection.masterEditionAccount);

    //     /**
    //      * INFO: NFT collection != tree
    //      * ---
    //      * NFTs collections can use multiple trees for their same collection.
    //      * When minting any compressed NFT, simply pass the collection's addresses
    //      * in the transaction using any valid tree the `payer` has authority over.
    //      *
    //      * These minted compressed NFTs should all still be apart of the same collection
    //      * on marketplaces and wallets.
    //      */

    //     //////////////////////////////////////////////////////////////////////////////
    //     //////////////////////////////////////////////////////////////////////////////

    //     /*
    //       Mint a single compressed NFT
    //     */

    //     const compressedNFTMetadata: MetadataArgs = {
    //         name: "NFT Name",
    //         symbol: collectionMetadataV3.data.symbol,
    //         // specific json metadata for each NFT
    //         uri: "https://supersweetcollection.notarealurl/token.json",
    //         creators: [
    //             {
    //                 address: payer.publicKey,
    //                 verified: false,
    //                 share: 100,
    //             },
    //             {
    //                 address: mintToPublicKey,
    //                 //   address: testWallet.publicKey,
    //                 verified: false,
    //                 share: 0,
    //             },
    //         ], // or set to null
    //         editionNonce: 0,
    //         uses: null,
    //         collection: null,
    //         primarySaleHappened: false,
    //         sellerFeeBasisPoints: 0,
    //         isMutable: false,
    //         // these values are taken from the Bubblegum package
    //         tokenProgramVersion: TokenProgramVersion.Original,
    //         tokenStandard: TokenStandard.NonFungible,
    //     };

    //     // fully mint a single compressed NFT to the payer
    //     console.log(`Minting a single compressed NFT to ${payer.publicKey.toBase58()}...`);

    //     await mintCompressedNFT(
    //         connection,
    //         payer,
    //         treeKeypair.publicKey,
    //         collection.mint,
    //         collection.metadataAccount,
    //         collection.masterEditionAccount,
    //         compressedNFTMetadata,
    //         // mint to this specific wallet (in this case, the tree owner aka `payer`)
    //         payer.publicKey,
    //     );

    //     // fully mint a single compressed NFT
    //     console.log(`Minting a single compressed NFT to ${mintToPublicKey}...`);
    //     // console.log(`Minting a single compressed NFT to ${testWallet.publicKey.toBase58()}...`);

    //     await mintCompressedNFT(
    //         connection,
    //         payer,
    //         treeKeypair.publicKey,
    //         collection.mint,
    //         collection.metadataAccount,
    //         collection.masterEditionAccount,
    //         compressedNFTMetadata,
    //         // mint to this specific wallet (in this case, airdrop to `testWallet`)
    //         mintToPublicKey,
    //         //   testWallet.publicKey,
    //     );

    //     //////////////////////////////////////////////////////////////////////////////
    //     //////////////////////////////////////////////////////////////////////////////

    //     // fetch the payer's final balance
    //     balance = await connection.getBalance(payer.publicKey);

    //     console.log(`===============================`);
    //     console.log(
    //         "Total cost:",
    //         numberFormatter((initBalance - balance) / LAMPORTS_PER_SOL, true),
    //         "SOL\n",
    //     );
    // })();
  },
);


router.get("/list/:collectionId",verifyApiKey, async (req: Request, res: Response) => {

  const { page = 1, pageSize = 10 } = req.query;

  const collectionId = req.params.collectionId;
  if(!collectionId) {
    return res.status(HttpResponseCode.BAD_REQUEST).json({
      data: null,
      error: [{ message: "Invalid collectionId" }],
    });
  }


  let data = JSON.stringify({
    "jsonrpc": "2.0",
    "id": "someId",
    "method": "getAssetsByGroup",
    "params": {
      "groupKey": "collection",
      "groupValue": `${collectionId}`,
      "page": parseInt(`${page}`),
      "limit": parseInt(`${pageSize}`)
    }
  });
  
  let config = {
    method: 'post',
    maxBodyLength: Infinity,
    url: 'https://devnet.helius-rpc.com/?api-key=458c90c5-1fd4-41a3-9502-251a0c93779d',
    headers: { 
      'Content-Type': 'application/json'
    },
    data : data
  };
  
  const result = await axios.request(config)
  const resultJson = result.data

  logger.info(JSON.stringify(resultJson))

  if(!resultJson){
    return res.status(HttpResponseCode.BAD_REQUEST).json({
      data: null,
      error: [{ message: "Invalid collectionId" }],
    });
  }

  return res.status(HttpResponseCode.SUCCESS).json({items: resultJson.result.items});


})


const allowedValues = [3, 5, 14, 15, 16, 17, 18, 19, 20, 24, 26, 30];
const calculateMaxDepth = (items: number) => {
  const powerOfTwo = Math.ceil(Math.log2(items));

  const closestValue = allowedValues.reduce((prev, curr) =>
    Math.abs(curr - powerOfTwo) < Math.abs(prev - powerOfTwo) ? curr : prev,
  );

  return closestValue;
};

export default router;
