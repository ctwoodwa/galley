import { useState } from 'react'

interface Sample {
  label: string
  group: string
  text: string
}

const SAMPLES: Sample[] = [
  {
    label: 'Weather forecast',
    group: 'Neutral',
    text: "Today's forecast calls for partly cloudy skies with temperatures reaching a high of 72 degrees. Expect light winds from the southwest and a small chance of afternoon showers moving in from the coast later this evening.",
  },
  {
    label: 'Product announcement',
    group: 'Neutral',
    text: "We're excited to announce the release of version 3.0. This update includes significant performance improvements, enhanced security features, and a completely redesigned interface based on your feedback. Update now through the settings menu.",
  },
  {
    label: 'News bulletin',
    group: 'Neutral',
    text: "City council voted late Tuesday to approve the downtown revitalization plan, allocating forty-two million dollars for infrastructure improvements and green space development. Construction is expected to begin next spring.",
  },
  {
    label: 'Step-by-step instructions',
    group: 'Neutral',
    text: "To get started, open the application and navigate to the settings panel. Select your preferred audio output device, then adjust the volume and balance controls to your liking. When you're ready, click Start to begin.",
  },
  {
    label: 'Warm reunion',
    group: 'Female',
    text: "Oh, I can't believe it's already been five years! It feels like just yesterday we were nervously walking into that tiny apartment with nothing but two suitcases and a secondhand couch. Look at everything we've built since then.",
  },
  {
    label: 'Spa welcome',
    group: 'Female',
    text: "Welcome to Rosewood Spa and Wellness. Whether you're here to unwind after a long week or celebrate a special occasion, our team is dedicated to making every moment feel extraordinary. Please let us know how we can make your visit perfect.",
  },
  {
    label: "Children's story",
    group: 'Female',
    text: "Once upon a time, in a forest filled with the most curious creatures, there lived a small fox named Marigold who had never once seen the ocean. One autumn morning, she packed a little bag with bread and berries and set off toward the sound of the waves.",
  },
  {
    label: 'Historical narration',
    group: 'Male',
    text: "For three hundred years, the castle had stood watch over the valley below. Generations had been born within its walls, lived their lives, and returned to the earth — yet the stones remained, silent witnesses to every triumph and every loss the centuries had brought.",
  },
  {
    label: 'News briefing',
    group: 'Male',
    text: "In tonight's briefing we'll cover three critical developments: the updated situation along the northern corridor, the emergency humanitarian aid package approved this afternoon, and the diplomatic summit scheduled for later this week.",
  },
  {
    label: 'Documentary narration',
    group: 'Male',
    text: "The deep ocean remains one of the least explored frontiers on Earth. Below 600 meters, sunlight disappears entirely and temperatures drop to near freezing. Yet life here is astonishing — organisms that have evolved over millions of years to thrive in conditions that would be lethal to most surface species.",
  },
  {
    label: 'Casual message',
    group: 'Conversational',
    text: "Hey, so I've been thinking about what you said last week, and honestly? You were right. I should've just called instead of sending that long message. Anyway, are you free Thursday? We should grab coffee and actually catch up properly.",
  },
  {
    label: 'Tense monologue',
    group: 'Conversational',
    text: "Look, I know what everyone thinks. I know how it looks from the outside. But you weren't there. You didn't see what I saw, and you don't know what it cost me to make that call. I'd do it again. Every single time.",
  },
  {
    label: 'Excited announcement',
    group: 'Conversational',
    text: "Okay, so you're not going to believe this, but — I got the job. The one in Edinburgh. I just got off the phone five minutes ago and I am still shaking. I don't even know where to start. This changes everything.",
  },
]

const GROUPS = ['Neutral', 'Female', 'Male', 'Conversational']

interface SampleTextPickerProps {
  onSelect: (text: string) => void
}

export function SampleTextPicker({ onSelect }: SampleTextPickerProps) {
  const [value, setValue] = useState('')

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const idx = parseInt(e.target.value, 10)
    if (!isNaN(idx) && SAMPLES[idx]) onSelect(SAMPLES[idx].text)
    setValue('')
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-medium tracking-wider uppercase text-stone-500 shrink-0">Sample</span>
      <select
        value={value}
        onChange={handleChange}
        className="flex-1 px-2 py-1 bg-stone-800 border border-stone-700 rounded text-stone-300 text-xs focus:outline-none focus:border-amber-500 cursor-pointer hover:border-stone-600 transition-colors"
      >
        <option value="">— choose —</option>
        {GROUPS.map((group) => (
          <optgroup key={group} label={group}>
            {SAMPLES.map((s, i) =>
              s.group === group ? <option key={i} value={i}>{s.label}</option> : null
            )}
          </optgroup>
        ))}
      </select>
    </div>
  )
}
