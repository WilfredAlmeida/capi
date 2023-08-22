# CAPI: cNFT API as a Service

CAPI is a Compressed NFT (cNFT) API as a service that provides APIs to mint compressed NFTs (cNFT).

CAPI takes in your collection details and NFT details and mints them to the provided addresses. You don't have to worry about the complexities of Merkle trees, Gas, or the chain in any sense. All you have to do is call the CAPI API.

CAPI stores your images, creates metadata for collection and images, stores the metadata JSON files, creates merkle tree and collection and mints the cNFTs all under ~15secs for 1000 cNFT mints.

CAPI uses the Helius DAS API to provide you with fast access to your minted cNFTs. Additionally, CAPI stores data about your mints to provide you with tracking and other desired usability features.

## Api Reference

1.  `/user/create`: Creates a new CAPI user in DB. Call this after authentication

Type: POST

Body:
| | | |
| --- | --- | --- |
| email | string | User email |
| | | |

Returns:
| | | |
| --- | --- | --- |
| userId | int | User Id |
| | | |

2. `/auth/key/new`: Creates a new API key for CAPI

Type: POST

Body: None

Returns:
| | | |
| --- | --- | --- |
| key | string | CAPI API Key |
| | | |

3. `/nft/mint`: Mint NFT Collection

Type: POST  

Header: Authorization `Bearer <API KEY>`

Body:  
Example
```json
{
    "collection": {
        "nftCount": 10,
        "mintAllTo": "someDaddyAddress",
        "collectionName": "Never gonna let you go",
        "collectionSymbol": "CAPI",
        "collectionImage": "ImageBase64"
    },
    "nft": [
        {
            "name": "Rickroll",
            "symbol": "Drums",
            "description": "Minted via Capi",
            "receiver": null,
            "image": "ImageBase64"
        },
        {
            "name": "Ping Pong",
            "symbol": "SomeSymbol",
            "description": "Your Hackathon Prize",
            "receiver": "SomeAddress",
            "image": "ImageBase64"
        }
    ]
}
```

**Params Explained**:  
All params are required  

`collection`:  
- `nftCount`: int: Count of total cNFTs to mint
- `mintAllTo`: Default address to mint all cNFTs to
- `collectionName`: Collection Name
- `collectionSymbol`: Collection Symbol
- `collectionImage`: Collection image in base64 encoding

`nft`: List of:
- `name`: cNFT Name
- `Symbol`: cNFT Symbol
- `description`: Description of cNFT
- `receiver`: Receiver Address. _nullable_
- `image`: cNFT Image


Returns: 
- `signatures`: string[]: Mint transactions
- `collectionMint`: string: Collection Mint

4. `/nft/list/:collectionMint?page=1&pageSize=10`: Get a list of all NFTs minted in a collection

Type: GET  

Header: Authorization `Bearer <API KEY>`

Params:
- `collectionMint`: The collection mint returned after minting
- `page`: Page index for paginated response
- `pageSize`: Page size


## Env Config
- `PORT`: Server Port
- `SUPABASE_URL`: Supabase URL
- `SUPABASE_ANON_KEY`: Supabase Anon Key
- `NODE_ENV`: Node evn, Eg. `production`, `staging`, `development`
- `HELIUS_KEY`: Helius API Key
- `UNKEY_KEY`: [Unkey](https://unkey.dev) admin key
- `UNKEY_API_ID`: Unkey API id


## Tech Used
- Express-TypeScript
- Supabase DB & Storage
- Bubblegum Protocol
- Metaplex SDK
- Helius DAS API

## FAQ
1. Where are metadata files stored?  
Metadata JSON and image files are stored in Supabase storage and their public URLs are used while minting.

2. Why is Supabase DB used?  
Metadata like collection info, tree info, mint into, transaction signatures and, more are stored in the relational database. See the schema in the next section.

3. What is the use of Unkey?  
Unkey is an open-source API key management platform used to provision and manage CAPI API keys with features like on-the-edge rate limiting and more.

4. How are cNFTs minted?
cNFTs are minted using the Bubblegum protocol by Metaplex Foundation.

5. Who pays for the gas for minting?  
cAPI as a service takes care of the gas and other costs. This enables sponsored/funded minting of cNFTs.

6. What is the use of Helius?  
Helius' DAS API is used to fetch cNFT informtion. The service is fast and efficient.
