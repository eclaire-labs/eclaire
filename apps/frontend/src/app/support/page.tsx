import { ArrowLeft, Mail, MessageSquare, Phone } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export default function SupportPage() {
  return (
    <div className="min-h-screen">
      <header className="border-b">
        <div className="container mx-auto px-4 md:px-6 max-w-7xl py-4 flex items-center">
          <Button variant="ghost" size="icon" asChild className="mr-2">
            <Link href="/">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <h1 className="text-xl font-bold">Support</h1>
        </div>
      </header>
      <main className="container mx-auto px-4 md:px-6 max-w-7xl py-8">
        <div className="text-center mb-12">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            We're Here to Help
          </h1>
          <p className="mt-4 text-xl text-muted-foreground">
            Get in touch with our support team
          </p>
        </div>

        <div className="grid gap-8 md:grid-cols-3 mb-12">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <MessageSquare className="mr-2 h-5 w-5" />
                Live Chat
              </CardTitle>
              <CardDescription>
                Chat with our support team in real-time
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Our live chat support is available Monday through Friday, 9am to
                5pm PT.
              </p>
            </CardContent>
            <CardFooter>
              <Button className="w-full">Start Chat</Button>
            </CardFooter>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Mail className="mr-2 h-5 w-5" />
                Email Support
              </CardTitle>
              <CardDescription>
                Send us an email and we'll respond within 24 hours
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                For non-urgent issues, email us at support@eclaire.com
              </p>
            </CardContent>
            <CardFooter>
              <Button className="w-full" variant="outline" asChild>
                <a href="mailto:support@eclaire.com">Email Us</a>
              </Button>
            </CardFooter>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Phone className="mr-2 h-5 w-5" />
                Phone Support
              </CardTitle>
              <CardDescription>
                Speak directly with a support representative
              </CardDescription>
            </CardHeader>
            <CardFooter>
              <Button className="w-full" variant="outline" asChild>
                <a href="tel:+18005551234">Call Us</a>
              </Button>
            </CardFooter>
          </Card>
        </div>

        <div className="max-w-2xl mx-auto">
          <Card>
            <CardHeader>
              <CardTitle>Contact Form</CardTitle>
              <CardDescription>
                Send us a message and we'll get back to you as soon as possible
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Name</Label>
                    <Input id="name" placeholder="Your name" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" type="email" placeholder="Your email" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="subject">Subject</Label>
                  <Input id="subject" placeholder="Subject of your message" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="message">Message</Label>
                  <Textarea id="message" placeholder="Your message" rows={5} />
                </div>
              </form>
            </CardContent>
            <CardFooter>
              <Button className="w-full">Send Message</Button>
            </CardFooter>
          </Card>
        </div>

        <div className="mt-16">
          <h2 className="text-2xl font-bold text-center mb-8">
            Frequently Asked Questions
          </h2>
          <div className="max-w-3xl mx-auto space-y-6">
            <div>
              <h3 className="font-semibold text-lg">
                How do I reset my password?
              </h3>
              <p className="text-muted-foreground">
                You can reset your password by clicking on the "Forgot
                password?" link on the login page. You'll receive an email with
                instructions to reset your password.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-lg">
                How do I connect a new device?
              </h3>
              <p className="text-muted-foreground">
                You can find detailed instructions for connecting new devices in
                the Dashboard section after logging in. We have specific guides
                for smartphones, tablets, laptops, and smartwatches.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-lg">
                What should I do if my API key isn't working?
              </h3>
              <p className="text-muted-foreground">
                First, make sure you're using the correct API key. You can find
                your API key in the Dashboard. If you're still having issues,
                you can generate a new API key or contact our support team for
                assistance.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-lg">
                How do I manage my account?
              </h3>
              <p className="text-muted-foreground">
                You can manage your account by going to Settings in your
                dashboard. Update your profile, change passwords, and manage
                your API keys and connected devices.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
