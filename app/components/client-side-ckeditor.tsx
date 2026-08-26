"use client";

import dynamic from "next/dynamic";

const ClientSideCKEditor = dynamic( () => import( "@/app/components/ckeditor" ), { ssr: false } );

export default ClientSideCKEditor;
