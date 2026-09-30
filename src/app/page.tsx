import { Playground } from "@/components/Playground";
import { isStudyOnly } from "@/lib/edition";

export default async function Home({ searchParams }: PageProps<"/">) {
  // The study site is static files with no server, so it reads the address in the browser instead.
  if (isStudyOnly()) return <Playground />;
  const { example, challenge, cert } = await searchParams;
  return (
    <Playground
      initialExampleId={typeof example === "string" ? example : undefined}
      initialChallengeId={typeof challenge === "string" ? challenge : undefined}
      initialCertId={typeof cert === "string" ? cert : undefined}
    />
  );
}
