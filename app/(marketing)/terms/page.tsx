import { SiteHeaderServer } from "@/components/site-header-server";
import { SiteFooter } from "@/components/site-footer";
import { AppNav } from "@/components/app-nav";

export default async function TermsPage() {
  return (
    <>
      <SiteHeaderServer />
      <main className="app-content">
        {/* Hero section */}
        <div className="bg-editorial-paper px-6 py-12 sm:px-8 sm:py-16">
          <div className="mx-auto max-w-2xl">
            <h1 className="font-editorial text-4xl font-bold text-editorial-ink mb-4">
              Terms of Service
            </h1>
            <p className="text-editorial-ink-soft">
              Last updated: May 22, 2026
            </p>
          </div>
        </div>

        {/* Content */}
        <div className="bg-white px-6 py-12 sm:px-8 sm:py-16">
          <div className="mx-auto max-w-2xl space-y-8 text-editorial-ink">
            <section>
              <h2 className="font-editorial text-2xl font-bold text-editorial-ink mb-4">
                1. Acceptance of Terms
              </h2>
              <p className="text-editorial-ink-soft leading-relaxed">
                By accessing and using LunchPad, you accept and agree to be bound by the terms and provision of this agreement. If you do not agree to abide by the above, please do not use this service.
              </p>
            </section>

            <section>
              <h2 className="font-editorial text-2xl font-bold text-editorial-ink mb-4">
                2. Use License
              </h2>
              <p className="text-editorial-ink-soft leading-relaxed mb-4">
                Permission is granted to temporarily download one copy of the materials (information or software) on LunchPad for personal, non-commercial transitory viewing only. This is the grant of a license, not a transfer of title, and under this license you may not:
              </p>
              <ul className="space-y-2 ml-6 text-editorial-ink-soft list-disc">
                <li>Modify or copy the materials</li>
                <li>Use the materials for any commercial purpose or for any public display</li>
                <li>Attempt to decompile or reverse engineer any software contained on LunchPad</li>
                <li>Remove any copyright or other proprietary notations from the materials</li>
                <li>Transfer the materials to another person or "mirror" the materials on any other server</li>
                <li>Violate any applicable laws or regulations</li>
              </ul>
            </section>

            <section>
              <h2 className="font-editorial text-2xl font-bold text-editorial-ink mb-4">
                3. Disclaimer
              </h2>
              <p className="text-editorial-ink-soft leading-relaxed">
                The materials on LunchPad are provided on an "as is" basis. LunchPad makes no warranties, expressed or implied, and hereby disclaims and negates all other warranties including, without limitation, implied warranties or conditions of merchantability, fitness for a particular purpose, or non-infringement of intellectual property or other violation of rights.
              </p>
            </section>

            <section>
              <h2 className="font-editorial text-2xl font-bold text-editorial-ink mb-4">
                4. Limitations
              </h2>
              <p className="text-editorial-ink-soft leading-relaxed">
                In no event shall LunchPad or its suppliers be liable for any damages (including, without limitation, damages for loss of data or profit, or due to business interruption) arising out of the use or inability to use the materials on LunchPad.
              </p>
            </section>

            <section>
              <h2 className="font-editorial text-2xl font-bold text-editorial-ink mb-4">
                5. Accuracy of Materials
              </h2>
              <p className="text-editorial-ink-soft leading-relaxed">
                The materials appearing on LunchPad could include technical, typographical, or photographic errors. LunchPad does not warrant that any of the materials on this website are accurate, complete, or current. LunchPad may make changes to the materials contained on this website at any time without notice.
              </p>
            </section>

            <section>
              <h2 className="font-editorial text-2xl font-bold text-editorial-ink mb-4">
                6. Links
              </h2>
              <p className="text-editorial-ink-soft leading-relaxed">
                LunchPad has not reviewed all of the sites linked to its website and is not responsible for the contents of any such linked site. The inclusion of any link does not imply endorsement by LunchPad of the site. Use of any such linked website is at the user's own risk.
              </p>
            </section>

            <section>
              <h2 className="font-editorial text-2xl font-bold text-editorial-ink mb-4">
                7. Modifications
              </h2>
              <p className="text-editorial-ink-soft leading-relaxed">
                LunchPad may revise these terms of service for this website at any time without notice. By using this website, you are agreeing to be bound by the then current version of these terms of service.
              </p>
            </section>

            <section>
              <h2 className="font-editorial text-2xl font-bold text-editorial-ink mb-4">
                8. Governing Law
              </h2>
              <p className="text-editorial-ink-soft leading-relaxed">
                These terms and conditions are governed by and construed in accordance with the laws of the United States, and you irrevocably submit to the exclusive jurisdiction of the courts located in the United States.
              </p>
            </section>

            <section>
              <h2 className="font-editorial text-2xl font-bold text-editorial-ink mb-4">
                9. Contact Information
              </h2>
              <p className="text-editorial-ink-soft leading-relaxed">
                If you have any questions about these Terms of Service, please contact us at our{" "}
                <a href="/contact" className="text-editorial-green hover:text-editorial-green-deep transition-colors">
                  contact page
                </a>
                .
              </p>
            </section>
          </div>
        </div>

        <SiteFooter />
      </main>
      <AppNav />
    </>
  );
}
