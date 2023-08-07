import { Collection } from "./collection";
import { NFT } from "./nft";

export interface RequestBody {
  collection: Collection;
  nft: NFT[];
}
