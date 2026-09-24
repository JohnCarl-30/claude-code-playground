import { Playground } from "@/components/Playground";

export default async function Home({ searchParams }: PageProps<"/">) {
  const { example, challenge, cert } = await searchParams;
  return (
    <Playground
      initialExampleId={typeof example === "string" ? example : undefined}
      initialChallengeId={typeof challenge === "string" ? challenge : undefined}
      initialCertId={typeof cert === "string" ? cert : undefined}
    />
  );
}
