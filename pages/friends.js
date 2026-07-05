import { useEffect } from "react";
import { useRouter } from "next/router";

export default function FriendsRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/messages?tab=relations");
  }, [router]);

  return null;
}
