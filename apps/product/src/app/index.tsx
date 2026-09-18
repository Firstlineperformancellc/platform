import { Redirect } from "expo-router";
import { Loading, useAuth } from "@/lib/auth";

// Entry: send each signed-in person to their side of the product.
export default function Index() {
  const { session, profile, loading } = useAuth();
  if (loading) return <Loading />;
  if (!session) return <Redirect href="/welcome" />;
  if (!profile) return <Loading />;
  if (profile.role === "admin") return <Redirect href="/admin" />;
  if (profile.role === "athlete") return <Redirect href="/athlete" />;
  return <Redirect href="/parent" />;
}
