import { redirect } from "next/navigation";

export default function TracksPage() {
  redirect("/challenges?tab=tracks");
}
