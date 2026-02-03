import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function AboutPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">About</h1>
        <p className="text-muted-foreground mt-1">
          Methodology and dataset information
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>What is this?</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>
            Hot Dog or Not is a benchmark for LLM vision models. Every model
            gets the same images and has to answer the same question: is this
            a hot dog? Each response includes a reasoning trace explaining
            what the model saw and why it decided the way it did.
          </p>
          <p>
            The question is simple but the dataset isn&apos;t. Bratwursts in
            buns, deconstructed chili dogs, corn dogs. These sit right at the
            edge of what counts as a &quot;hot dog,&quot; and models have to
            commit to yes or no with no room to hedge.
          </p>
          <p>
            We care more about the reasoning than the accuracy number. The
            traces show which visual features a model latched onto, where it
            second-guessed itself, and where its representation of
            &quot;hot dog&quot; broke down. That tells you something about how
            the model actually processes images.
          </p>
          <p>
            It gets more useful when you compare models. Two models look at
            the same ambiguous image, one says yes, one says no. Read their
            reasoning side by side and you can see exactly where they diverge:
            what one model treated as a defining feature, the other ignored
            entirely.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Dataset</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            The default dataset is 180 images sourced from{" "}
            <a
              href="https://www.pexels.com"
              className="text-primary underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              Pexels
            </a>
            , split evenly into two categories:
          </p>
          <ul className="list-disc list-inside space-y-1">
            <li>
              <strong>hot_dog</strong> — 90 images of hot dogs
            </li>
            <li>
              <strong>not_hot_dog</strong> — 90 images of other food
            </li>
          </ul>
          <p>
            The repo includes two Pexels download scripts in{" "}
            <code className="bg-muted px-1 py-0.5 rounded font-mono text-xs">
              scripts/
            </code>
            : one for hot dog images and one for
            not-hot-dog images (intentionally chosen to look similar and
            trip up models). Get a free API key at{" "}
            <a
              href="https://www.pexels.com/api/"
              className="text-primary underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              pexels.com/api
            </a>{" "}
            to download more.
          </p>
          <p>
            You can also add your own images. Drop them into{" "}
            <code className="bg-muted px-1 py-0.5 rounded font-mono text-xs">
              backend/data/test/hot_dog/
            </code>{" "}
            and{" "}
            <code className="bg-muted px-1 py-0.5 rounded font-mono text-xs">
              backend/data/test/not_hot_dog/
            </code>{" "}
            and the benchmark picks them up automatically. Any mix of
            jpg, png, or webp works.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Methodology</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>Each image is sent to the model with this prompt:</p>
          <pre className="bg-muted p-3 rounded text-xs whitespace-pre-wrap">
{`Look at the image. Is it a hot dog (food: a sausage served in a bun/roll; any cooking style)?

Output exactly:
Observations: <brief description of what is visible>
Answer: <yes|no>`}
          </pre>
          <p>
            Temperature is set to <code>0.0</code> for deterministic
            responses. The answer line is parsed for &quot;yes&quot; or
            &quot;no.&quot; Unparseable responses count as errors.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Metrics</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <ul className="list-disc list-inside space-y-1">
            <li>
              <strong>Accuracy</strong> - Fraction of correct predictions
            </li>
            <li>
              <strong>Precision</strong> - Of images predicted as hot dogs, how
              many actually are
            </li>
            <li>
              <strong>Recall</strong> - Of actual hot dogs, how many were
              correctly identified
            </li>
            <li>
              <strong>F1 Score</strong> - Harmonic mean of precision and recall
            </li>
          </ul>
          <p>
            Positive class = hot dog (model answers &quot;yes&quot;), Negative
            class = not hot dog (model answers &quot;no&quot;).
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Models</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            All models are accessed via{" "}
            <a
              href="https://openrouter.ai"
              className="text-primary underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              OpenRouter
            </a>{" "}
            using their free tier. Current models:
          </p>
          <ul className="list-disc list-inside space-y-1">
            <li>NVIDIA Nemotron Nano 12B VL</li>
            <li>Google Gemma 3 27B</li>
            <li>AllenAI Molmo 2 8B</li>
            <li>Google Gemma 3 12B</li>
          </ul>
          <p className="text-muted-foreground text-xs mt-2">
            Models may change as new free vision models become available on OpenRouter.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Planned</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <ul className="list-disc list-inside space-y-1">
            <li>
              <strong>Image difficulty scoring</strong> — rank images by how
              many models get them wrong. An image that trips up 3 out of 4
              models tells you more than one they all ace.
            </li>
            <li>
              <strong>Reasoning feature extraction</strong> — parse
              observation traces to find which visual features models mention
              (bun, sausage, mustard, shape) and correlate them with accuracy.
              Do false positives share a common trigger?
            </li>
            <li>
              <strong>Consistency testing</strong> — run the same model on the
              same image multiple times at temperature &gt; 0. A model that
              flips between yes and no on repeated runs is uncertain in a way
              that a single answer hides.
            </li>
            <li>
              <strong>Prompt sensitivity</strong> — same images, different
              prompt wording. If accuracy swings 20% on a rephrasing, the
              model&apos;s visual understanding is thinner than the number
              suggests.
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
