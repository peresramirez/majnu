import { ErrorState } from "@/components/app/error-state"

export default function GiftNotFound() {
  return (
    <ErrorState
      title="This gift isn't here"
      body="It may belong to another account, or the address is incomplete. All your own gifts are in My gifts."
      back={{ href: "/dashboard/gifts", label: "My gifts" }}
    />
  )
}
