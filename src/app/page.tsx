import { Playground } from "@/components/Playground";

export default async function Home({ searchParams }: PageProps<"/">) {
  const { example } = await searchParams;
  return <Playground initialExampleId={typeof example === "string" ? example : undefined} />;
}
