import { SiteHeaderServer } from "@/components/site-header-server";
import { SiteFooter } from "@/components/site-footer";
import { AppNav } from "@/components/app-nav";

export const dynamic = "force-dynamic";

export default async function PrivacyPage() {
  return (
    <>
      <SiteHeaderServer />
      <main className="app-content">
        {/* Hero section */}
        <div className="bg-editorial-paper px-6 py-12 sm:px-8 sm:py-16">
          <div className="mx-auto max-w-2xl">
            <h1 className="font-editorial text-4xl font-bold text-editorial-ink mb-4">
              Privacy Policy
            </h1>
            <p className="text-editorial-ink-soft">
              Last updated: {new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
            </p>
          </div>
        </div>

        {/* Content */}
        <div className="bg-white px-6 py-12 sm:px-8 sm:py-16">
          <div className="mx-auto max-w-2xl space-y-8 text-editorial-ink">
            <section>
              <h2 className="font-editorial text-2xl font-bold text-editorial-ink mb-4">
                1. Introduction
              </h2>
              <p className="text-editorial-ink-soft leading-relaxed">
                LunchPad ("we", "us", "our", or "Company") operates the LunchPad website and service. This page informs you of our policies regarding the collection, use, and disclosure of personal data when you use our service and the choices you have associated with that data.
              </p>
            </section>

            <section>
              <h2 className="font-editorial text-2xl font-bold text-editorial-ink mb-4">
                2. Information Collection and Use
              </h2>
              <p className="text-editorial-ink-soft leading-relaxed mb-4">
                We collect several different types of information for various purposes to provide and improve our service to you.
              </p>
              <h3 className="font-semibold text-editorial-ink mb-2">
                Types of Data Collected:
              </h3>
              <ul className="space-y-2 ml-6 text-editorial-ink-soft list-disc">
                <li><strong>Personal Data:</strong> Email address, name, order preferences, dietary restrictions, and school/restaurant information</li>
                <li><strong>Payment Information:</strong> Credit card and billing information processed securely through Stripe</li>
                <li><strong>Usage Data:</strong> Browser type, IP address, pages visited, and time spent on pages</li>
                <li><strong>Device Information:</strong> Device type, operating system, and device identifiers</li>
              </ul>
            </section>

            <section>
              <h2 className="font-editorial text-2xl font-bold text-editorial-ink mb-4">
                3. Use of Data
              </h2>
              <p className="text-editorial-ink-soft leading-relaxed mb-4">
                LunchPad uses the collected data for various purposes:
              </p>
              <ul className="space-y-2 ml-6 text-editorial-ink-soft list-disc">
                <li>To provide and maintain our service</li>
                <li>To notify you about changes to our service</li>
                <li>To allow you to participate in interactive features of our service</li>
                <li>To provide customer support and respond to your requests</li>
                <li>To gather analysis or valuable information for service improvement</li>
                <li>To monitor the usage of our service</li>
                <li>To detect, prevent and address technical and security issues</li>
              </ul>
            </section>

            <section>
              <h2 className="font-editorial text-2xl font-bold text-editorial-ink mb-4">
                4. Security of Data
              </h2>
              <p className="text-editorial-ink-soft leading-relaxed">
                The security of your data is important to us but remember that no method of transmission over the Internet or method of electronic storage is 100% secure. While we strive to use commercially acceptable means to protect your Personal Data, we cannot guarantee its absolute security. We use industry-standard encryption (HTTPS) and secure data storage practices.
              </p>
            </section>

            <section>
              <h2 className="font-editorial text-2xl font-bold text-editorial-ink mb-4">
                5. Third-Party Service Providers
              </h2>
              <p className="text-editorial-ink-soft leading-relaxed mb-4">
                We may employ third party companies and individuals to facilitate our service ("Service Providers"), provide the service on our behalf, perform service-related services or assist us in analyzing how our service is used.
              </p>
              <p className="text-editorial-ink-soft leading-relaxed">
                These third parties may have access to your Personal Data only to perform these tasks on our behalf and are obligated not to disclose or use it for any other purpose. We work with the following types of service providers:
              </p>
              <ul className="space-y-2 ml-6 text-editorial-ink-soft list-disc mt-2">
                <li><strong>Payment Processing:</strong> Stripe (PCI-DSS compliant)</li>
                <li><strong>Email Communication:</strong> Resend</li>
                <li><strong>Database and Hosting:</strong> Vercel and PostgreSQL providers</li>
              </ul>
            </section>

            <section>
              <h2 className="font-editorial text-2xl font-bold text-editorial-ink mb-4">
                6. Links to Other Sites
              </h2>
              <p className="text-editorial-ink-soft leading-relaxed">
                Our service may contain links to other sites that are not operated by us. If you click on a third party link, you will be directed to that third party's site. We strongly advise you to review the Privacy Policy of every site you visit. We have no control over and assume no responsibility for the content, privacy policies or practices of any third party sites or services.
              </p>
            </section>

            <section>
              <h2 className="font-editorial text-2xl font-bold text-editorial-ink mb-4">
                7. Children's Privacy
              </h2>
              <p className="text-editorial-ink-soft leading-relaxed">
                Our service does not address anyone under the age of 13 ("Children"). We do not knowingly collect personally identifiable information from anyone under the age of 13. If you are a parent or guardian and you are aware that your child has provided us with Personal Data, please contact us. If we become aware that we have collected Personal Data from children without verification of parental consent, we take steps to remove such information and terminate the child's account.
              </p>
            </section>

            <section>
              <h2 className="font-editorial text-2xl font-bold text-editorial-ink mb-4">
                8. Changes to This Privacy Policy
              </h2>
              <p className="text-editorial-ink-soft leading-relaxed">
                We may update our Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page and updating the "Last updated" date at the top of this Privacy Policy.
              </p>
            </section>

            <section>
              <h2 className="font-editorial text-2xl font-bold text-editorial-ink mb-4">
                9. Contact Us
              </h2>
              <p className="text-editorial-ink-soft leading-relaxed">
                If you have any questions about this Privacy Policy, please contact us at our{" "}
                <a href="/contact" className="text-editorial-green hover:text-editorial-green-deep transition-colors">
                  contact page
                </a>
                .
              </p>
            </section>

            <section>
              <h2 className="font-editorial text-2xl font-bold text-editorial-ink mb-4">
                10. Legal Basis for Processing
              </h2>
              <p className="text-editorial-ink-soft leading-relaxed">
                We process your personal data on the following legal bases:
              </p>
              <ul className="space-y-2 ml-6 text-editorial-ink-soft list-disc mt-2">
                <li><strong>Performance of Contract:</strong> Processing necessary to provide our services to you</li>
                <li><strong>Consent:</strong> Where you have given explicit consent for specific processing activities</li>
                <li><strong>Legitimate Interests:</strong> Where processing is necessary for our legitimate business interests</li>
                <li><strong>Legal Obligations:</strong> Where required by law or regulation</li>
              </ul>
            </section>
          </div>
        </div>

        <SiteFooter />
      </main>
      <AppNav />
    </>
  );
}
