import express, { Router, Request, Response } from "express";

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
dotenv.config();

const router = Router();

// define some reusable balance values for tracking
let initBalance: number, balance: number;

router.post(
  "/mint",
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

    // const { nftCount, mintTo, collectionName, collectionSymbol, images } = req.body;

    const metadataUrls = [];

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
      metadataUrls.push(metadataUrl);
    }

    // uploadImagesToSupabase();

    // const collectionImageUrl = uploadImagesToSupabase()

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

    let mintToPublicKey;
    try {
      mintToPublicKey = new PublicKey(collection.mintAllTo!);
    } catch (err) {
      logger.error(err);
      return res.status(HttpResponseCode.BAD_REQUEST).json({
        data: null,
        error: [{ message: "Invalid mintTo public key" }],
      });
    }

    // generate a new keypair for use in this demo (or load it locally from the filesystem when available)
    const payer = process.env?.LOCAL_PAYER_JSON_ABSPATH
      ? loadKeypairFromFile(process.env?.LOCAL_PAYER_JSON_ABSPATH)
      : loadOrGenerateKeypair("payer");

    console.log("Payer address:", payer.publicKey.toBase58());
    // console.log("Test wallet address:", testWallet.publicKey.toBase58());
    console.log("Mint to address:", mintToPublicKey);

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

    const canopyDepth = maxDepthSizePair.maxDepth - 5;

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

      return res
        .status(HttpResponseCode.INTERNAL_SERVER_ERROR)
        .json({
          data: null,
          errors: [
            {
              message:
                "Not enough SOL to allocate the merkle tree. Donate some.",
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
        uri: "https://supersweetcollection.notarealurl/collection.json",
        sellerFeeBasisPoints: 100,
        creators: [
          {
            address: mintToPublicKey,
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

    const compressedNFTMetadata: MetadataArgs = {
      name: "CNFT Name",
      symbol: collectionMetadataV3.data.symbol,
      // specific json metadata for each NFT
      uri: "https://supersweetcollection.notarealurl/token.json",
      creators: [
        {
          address: mintToPublicKey,
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
    };

    await mintCompressedNFT(
      connection,
      payer,
      treeKeypair.publicKey,
      nftCollection.mint,
      nftCollection.metadataAccount,
      nftCollection.masterEditionAccount,
      compressedNFTMetadata,
      // mint to this specific wallet (in this case, the tree owner aka `payer`)
      mintToPublicKey,
    );

    // fully mint a single compressed NFT to the payer
    console.log(
      `Minting a single compressed NFT to ${payer.publicKey.toBase58()}...`,
    );

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

router.post(
  "/mint/initiate",
  [
    body("nftCount")
      .trim()
      .escape()
      .notEmpty()
      .isNumeric()
      .withMessage("Invalid nftCount"),
  ],
  handleInvalidInput,
  async (req: Request, res: Response) => {},
);
const allowedValues = [3, 5, 14, 15, 16, 17, 18, 19, 20, 24, 26, 30];
const calculateMaxDepth = (items: number) => {
  const powerOfTwo = Math.ceil(Math.log2(items));

  const closestValue = allowedValues.reduce((prev, curr) =>
    Math.abs(curr - powerOfTwo) < Math.abs(prev - powerOfTwo) ? curr : prev,
  );

  return closestValue;
};

export default router;
