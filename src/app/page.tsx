import { Playground } from "@/components/Playground";

export default async function Home({ searchParams }: PageProps<"/">) {
  const { example, challenge } = await searchParams;
  return (
    <Playground
      initialExampleId={typeof example === "string" ? example : undefined}
      initialChallengeId={typeof challenge === "string" ? challenge : undefined}
    />
  );
}
