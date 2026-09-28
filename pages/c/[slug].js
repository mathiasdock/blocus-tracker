// QR destination: one short route per campaign, never an indexed duplicate of
// the homepage. The campaign key survives as an internal query parameter.
export async function getServerSideProps({ params }) {
  const slug = typeof params?.slug === "string" ? params.slug : "";
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 64) {
    return { notFound: true };
  }
  return {
    redirect: { destination: `/?campaign=${encodeURIComponent(slug)}`, permanent: false },
  };
}

export default function CampaignRedirect() { return null; }
