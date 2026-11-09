"use client";

import { useRouter } from "next/navigation";
import LookeLanding, { type LookeDestination } from "../components/landing/LookeLanding";
import "../components/landing/looke-landing.css";

export default function Home() {
  const router = useRouter();
  function enterApp(destination: LookeDestination) {
    router.push(destination === "Trending" ? "/feed" : `/feed?screen=${encodeURIComponent(destination)}`);
  }
  return <main><LookeLanding onEnter={enterApp} /></main>;
}
