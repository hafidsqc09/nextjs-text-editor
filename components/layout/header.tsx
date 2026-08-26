"use client";

import * as React from "react";
import Link from "next/link";

import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  navigationMenuTriggerStyle,
} from "@/components/ui/navigation-menu";

export function Header() {
  return (
    <NavigationMenu>
      <NavigationMenuList>
        <NavigationMenuItem>
          <NavigationMenuLink className={navigationMenuTriggerStyle()} render={<Link href="/">CKEditor</Link>} />
        </NavigationMenuItem>

        <NavigationMenuItem>
          <NavigationMenuLink className={navigationMenuTriggerStyle()} render={<Link href="/editor-js">Editor.js</Link>} />
        </NavigationMenuItem>

        <NavigationMenuItem>
          <NavigationMenuLink className={navigationMenuTriggerStyle()} render={<Link href="/tiptap">Tiptap</Link>} />
        </NavigationMenuItem>

        <NavigationMenuItem>
          <NavigationMenuLink className={navigationMenuTriggerStyle()} render={<Link href="/block-note">Block Note</Link>} />
        </NavigationMenuItem>
      </NavigationMenuList>
    </NavigationMenu>
  )
}
