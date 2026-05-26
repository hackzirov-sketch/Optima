#!/bin/bash

# Page'lar ro'yxati
PAGES=(
  "Dashboard:DashboardPage"
  "Workspace:WorkspacePage"
  "Chat:ChatPage"
  "Meetings:MeetingsPage"
  "Premium:PremiumPage"
  "Community:CommunityPage"
  "News:NewsPage"
  "Bank:BankPage"
  "Assistant:AssistantPage"
  "Teams:TeamsPage"
  "Projects:ProjectsPage"
  "TasksNotes:TasksNotesPage"
  "Profile:ProfilePage"
  "Settings:SettingsPage"
)

SRC_DIR="/tmp/Optima-main/artifacts/upz-landing/src/pages"
DEST_DIR="/home/claude/upz-nextjs-frontend/app/app"

for page in "${PAGES[@]}"; do
  IFS=':' read -r folder filename <<< "$page"
  folder_lower=$(echo "$folder" | tr '[:upper:]' '[:lower:]')
  
  echo "Converting $filename to $folder_lower..."
  
  # Ko'chirish
  cp "$SRC_DIR/${filename}.tsx" "$DEST_DIR/$folder_lower/page.tsx"
  
  # 'use client' qo'shish
  sed -i "1i'use client';\n" "$DEST_DIR/$folder_lower/page.tsx"
  
  # wouter ni next/navigation ga o'zgartirish
  sed -i 's/import { Link } from "wouter"/import Link from "next\/navigation"/' "$DEST_DIR/$folder_lower/page.tsx"
  sed -i 's/import { Link, useLocation } from "wouter"/import Link from "next\/navigation";\nimport { useRouter } from "next\/navigation"/' "$DEST_DIR/$folder_lower/page.tsx"
  sed -i 's/import { useLocation } from "wouter"/import { useRouter } from "next\/navigation"/' "$DEST_DIR/$folder_lower/page.tsx"
  
  # Props ni useAuth bilan almashtirish
  sed -i 's/interface Props {/\/\/ Props replaced with useAuth hook/' "$DEST_DIR/$folder_lower/page.tsx"
  sed -i 's/export default function.*({ user, onLogout }: Props)/import { useAuth } from "@\/hooks\/useAuth";\n\nexport default function/' "$DEST_DIR/$folder_lower/page.tsx"
  
done

echo "Barcha page'lar konvert qilindi!"
