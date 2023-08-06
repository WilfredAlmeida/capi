import supabase from "../db/supabase";

const uploadFilesToSupabase = async (files: String[]) => {

    const urls = []

    for (let i = 0; i < files.length; i++) {

        const {data, error} = await supabase.storage.from("nft-images").upload(`${(Math.random() + 1).toString(36).substring(6)}`, Buffer.from(files[i]))

        urls.push(supabase.storage.from("nft-images").getPublicUrl(data?.path!))

    }

    return urls;

}

export default uploadFilesToSupabase;