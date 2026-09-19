"use client";

import Image from "next/image";
import { useState } from "react";

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "ST";
}

export default function PlayerFace({
  name,
  position,
  code,
  captain = false,
  headshot = false,
  large = false,
}: {
  name: string;
  position: string;
  code?: number;
  captain?: boolean;
  headshot?: boolean;
  large?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const src = code ? `/api/player-photo/${code}` : null;

  return <div className={`playerAvatar playerAvatar-${position.toLowerCase()} ${large ? "large" : ""}`} aria-hidden="true">
    <span>{initials(name)}</span>
    {headshot && src && !failed && (
      <Image
        src={src}
        alt=""
        fill
        sizes={large ? "88px" : "56px"}
        unoptimized
        className="playerHeadshot"
        onError={() => setFailed(true)}
      />
    )}
    {captain && <b className="captainMark">C</b>}
  </div>;
}
