import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

/** 📚 favicon (rebrand round 2) — rendered by Next, no asset file needed. */
export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 24,
      }}
    >
      📚
    </div>,
    { ...size },
  );
}
