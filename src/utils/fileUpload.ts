import supabase from "../db/supabase";

const uploadImagesToSupabase = async (file: string) => {
  const base64 = file.split("base64,")[1];

  const { data, error } = await supabase.storage
    .from("nft-images")
    .upload(
      `${(Math.random() + 1).toString(36).substring(6)}.jpeg`,
      Buffer.from(base64, "base64"),
      { contentType: "image/jpeg" },
    );

  const uploadData = supabase.storage
    .from("nft-images")
    .getPublicUrl(data?.path!);

  return uploadData.data.publicUrl;
};

const uploadJsonMetadataToSupabase = async (file: string) => {
  const { data, error } = await supabase.storage
    .from("metadata-json")
    .upload(
      `nft/${(Math.random() + 1).toString(36).substring(6)}.json`,
      Buffer.from(file),
    );

  const uploadData = supabase.storage
    .from("metadata-json")
    .getPublicUrl(data?.path!);

  return uploadData.data.publicUrl;
};

export { uploadImagesToSupabase, uploadJsonMetadataToSupabase };
