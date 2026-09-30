import type { MetadataRoute } from "next";

// The marketing page is public; everything behind a login or an invitation
// link stays out of search engines (COMP-004). Pages and responses under these
// paths also carry noindex metadata / X-Robots-Tag.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/venue", "/couple", "/invite", "/api"] },
  };
}
