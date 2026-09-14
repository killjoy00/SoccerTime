import type { Metadata } from "next";
import HistoryClient from "./HistoryClient";

export const metadata: Metadata = {
  title: "History · SoccerTime",
  description: "SoccerTime rivalry history, records and round champions",
};

export default function HistoryPage() {
  return <HistoryClient />;
}
