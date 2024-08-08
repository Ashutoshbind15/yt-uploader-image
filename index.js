import { createClient } from "redis";

const dummyMetadata = {
  title: "Your Video Title",
  description: "Your Video Description",
  tags: ["tag1", "tag2"],
  categoryId: "22", // Example category
  privacyStatus: "private", // 'private', 'public', or 'unlisted'
};

const publishMessage = (channel, message, publisher) => {
  publisher.publish(channel, message);
};

const fetchVideoFromUrl = async (url) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch video: ${response.statusText}`);
  }
  return response.blob(); // Convert the response to a blob
};

async function uploadVideo(
  accessToken,
  videoFile,
  client,
  vid,
  uid,
  metadata = dummyMetadata
) {
  const url =
    "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status";

  // Create the metadata for the video
  const body = JSON.stringify({
    snippet: {
      title: metadata.title,
      description: metadata.description,
      tags: metadata.tags,
      categoryId: metadata.categoryId, // Example: "22" for People & Blogs
    },
    status: {
      privacyStatus: metadata.privacyStatus, // 'private', 'public', or 'unlisted'
    },
  });

  // Initial request to get the location URL for the video upload

  console.log("accessToken", accessToken);
  console.log("videoFile", videoFile);
  console.log("body", body);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "X-Upload-Content-Length": videoFile.size,
      "X-Upload-Content-Type": videoFile.type,
    },
    body: body,
  });

  console.log("location req res", response);

  if (response.ok) {
    const locationUrl = response.headers.get("Location");

    // Upload the video file to the location URL
    const uploadResponse = await fetch(locationUrl, {
      method: "PUT",
      headers: {
        "Content-Type": videoFile.type,
        "Content-Length": videoFile.size,
      },
      body: videoFile,
    });

    console.log("upload res", uploadResponse);

    if (uploadResponse.ok) {
      console.log("Video uploaded successfully");

      publishMessage(
        `upload-status`,
        JSON.stringify({
          uid: uid,
          vid: vid,
          status: "uploaded",
        }),
        client
      );

      const uploadResult = await uploadResponse.json();
      console.log(uploadResult);
      return uploadResult;
    } else {
      publishMessage(
        `upload-status`,
        JSON.stringify({
          uid: uid,
          vid: vid,
          status: "upload-failed",
        }),
        client
      );
      console.error("Video upload failed", uploadResponse.statusText);
    }
  } else {
    publishMessage(
      `upload-status`,
      JSON.stringify({
        uid: uid,
        vid: vid,
        status: "initiation-failed",
      }),
      client
    );

    console.error("Failed to initiate upload", response.statusText);
  }
}

const init = async () => {
  const url = process.env.VIDEO_URI;
  const accessToken = process.env.ACCESS_TOKEN;

  const vid = process.env.VIDEO_ID;
  const uid = process.env.USER_ID;

  const client = await createClient({
    url: process.env.REDIS_URL,
  })
    .on("error", (err) => console.log("Redis Client Error", err))
    .connect();

  try {
    const videoFile = await fetchVideoFromUrl(url);
    const uploadResult = await uploadVideo(
      accessToken,
      videoFile,
      client,
      vid,
      uid
    );
    console.log(uploadResult);
  } catch (error) {
    console.error(error);
  }
};

init();
