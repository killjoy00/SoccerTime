import Link from "next/link";
import SoccerTimeClient from "./SoccerTimeClient";

export default function Page(){
  return <>
    <SoccerTimeClient/>
    <Link className="historyShortcut" href="/history" aria-label="Open rivalry history and records">📊 History</Link>
  </>;
}
