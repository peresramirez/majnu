import type { Metadata } from "next"
import { getSignedInUser } from "@/components/app/session"
import { TemplatesView } from "./templates-view"

export const metadata: Metadata = { title: "Templates" }
export const dynamic = "force-dynamic"

export default async function TemplatesPage() {
  const user = await getSignedInUser()
  return <TemplatesView guest={user?.isGuest ?? false} />
}
