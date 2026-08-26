"use client";

import dynamic from "next/dynamic";

export const ClientSideBlockNoteEditor = dynamic(() => import("./block-note"), { ssr: false });