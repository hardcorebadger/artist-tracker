
from openai import OpenAI
import json
from .errors import ErrorResponse
import re
from fuzzywuzzy import fuzz

YT_DIY_DISTROS = [
   "DistroKid", "Ditto", "TuneCore", "CDBaby", "United Masters", "Symphonic", "EVEARA", "SongCast", "Too Lost", "Amuseio", "Repost Network", "IIP-DDS", "N/A", "CmdShft"
]
YT_MAJOR_DISTROS = [
   "The Orchard Enterprises", "Universal Music Group", "Warner Records Inc", "Sony Entertainment Group", "Atlantic Records", "Ingrooves", "Columbia", "Epic", "Alamo", "Arista Records", "300 Entertainment", "Virgin Music Group", "Sony Music Nashville", "RCA Records Label Nashville"
]
YT_KNOWN_INDIE_DISTROS = [
   "Stem Disintermedia Inc.", "Vydia", "Foundation Media LLC"
]
SP_MAJOR_KEYWORDS = [
   "sony", "umg", "warner", "universal", "atlantic", "the orchard", "ingrooves", "columbia", "epic", "alamo", "300 entertainment"
]
SP_KNOWN_INDIE_KEYWORDS = [
   "empire", "10k project", "all is on music"
]
SP_SIGNED_KEYWORDS = [
   "under exclusive license to"
]
SP_DIY_KEYWORDS = [
   "distrokid", "ditto", "tunecore", "cdbaby", "united masters", "symphonic", "records dk", "cmdshft"
]

CP_EVAL_SYS = """
You are a music data research assistant that helps record labels find un-signed artists.
Your job today is to help sort through artists and decide whether or not they are signed.
You will be supplied their name, and the copyrights from their most recent releases
Based on this info, figure out whether they are signed.
For example, if the copyrights include major record labels, they are signed.
Or if they contain an indie record label you may or may not have heard of, they are signed.
If the copyrights include artifacts from indie DIY distributors ie 'TuneCore', 'DK' 'Ditto' 'CD Baby', 'Independent' or 'Distrokid' - they are NOT signed.
If the copyrights seem to match the artist's name, or a variation of the artist's name, such as an abbreviation, or playful riff on it, it is likely their own 'fake' company, and thus they are NOT signed.
Please reply in JSON using the following format: an object with 3 keys - 'reasoning', 'signed', and 'rights_holder', where 'reasoning' is your reasoning behind your evaluation, 'signed' is either 'yes' or 'no' strictly in lowercase, and 'rights_holder' is the label you deem the artist to be signed to (or blank if they are not signed)
"""

class SpotifyLLMEvaluator():
  def __init__(self, open_ai_token):
    self.token = open_ai_token
    self.client = OpenAI(
      api_key="DISABLED",
    )
  
  def copyright_eval_completion(self, name, plines):
    training_messages = [
        {'role': 'system', 'content': CP_EVAL_SYS},
        {"role": "user", "content": "Artist: senses \n\nRecent P-Lines:\n['2023 senses', '2023 senses', '2023 senses', '2023 senses']"}, {"role": "assistant", "content": "{\n  \"reasoning\": \"The recent P-Lines for senses seem to match the artist's name, indicating self-distribution. There are no indicators of association with a label or group, and no presence of major or indie record labels in the copyright lines. This suggests that senses is likely not signed.\",\n  \"signed\": \"no\",\n  \"rights_holder\": \"\"\n}"}, {"role": "user", "content": "Artist: L\u00d8L\u00d8 \n\nRecent P-Lines:\n['2024 Hopeless Records, Inc.', '2023 Hopeless Records, Inc.', '\u2117 2023 907 Records under exclusive license to Wax Records', '2023 Hopeless Records, Inc.']"}, {"role": "assistant", "content": "{\n  \"reasoning\": \"The recent P-Lines indicate associations with major record labels 'Hopeless Records, Inc.' and '907 Records' under exclusive license to 'Wax Records'. These affiliations with major record labels clearly indicate that L\\u00d8L\\u00d8 is signed.\",\n  \"signed\": \"yes\",\n  \"rights_holder\": \"Hopeless Records, Inc.\"\n}"}, {"role": "user", "content": "Artist: First and Forever \n\nRecent P-Lines:\n['2023 First and Forever', '2023 First and Forever', '2023 First and Forever', '2023 First and Forever']"}, {"role": "assistant", "content": "{\n  \"reasoning\": \"The copyright lines for First and Forever's recent releases all reference the artist's name, indicating a potential self-release or association with the artist's own 'fake' company. Additionally, there are no indicators of major or indie record labels, nor any DIY distribution platforms. Given this, it's likely that First and Forever is not signed.\",\n  \"signed\": \"no\",\n  \"rights_holder\": \"\"\n}"}, {"role": "user", "content": "Artist: Z. SMITH \n\nRecent P-Lines:\n['2023 Space Monkey Mafia', '2023 Space Monkey Mafia', '2023 Space Monkey Mafia', '2023 Space Monkey Mafia']"}, {"role": "assistant", "content": "{\n  \"reasoning\": \"The recent copyright lines all refer to 'Space Monkey Mafia', which could be an indie record label. The copyright lines do not reference the artist's name 'Z. SMITH' and do not resemble any variation or playful riff on it. This indicates that 'Space Monkey Mafia' is likely an indiependent record label, and Z. SMITH is therefore signed.\",\n  \"signed\": \"yes\",\n  \"rights_holder\": \"Space Monkey Mafia\"\n}"}, {"role": "user", "content": "Artist: Beauty School Dropout \n\nRecent P-Lines:\n['2023 Verswire', '2022 VERSWIRE', '2023 Verswire', '2023 Verswire in association with idobi radio']"}, {"role": "assistant", "content": "{\n  \"reasoning\": \"The recent copyrights are associated with 'Verswire,' and one of the lines mentions 'idobi radio.' There are no major record labels mentioned in the copyrights. Additionally, there are no indicators of self-distribution platforms such as TuneCore or DistroKid. 'Versewire' does not resemble the artist's name or a playful riff on it, so likely refers to an indie label. This indicates 'Beauty School Dropout' is likely signed.\",\n  \"signed\": \"yes\",\n  \"rights_holder\": \"Verswire\"\n}"}, {"role": "user", "content": "Artist: Marlhy \n\nRecent P-Lines:\n['2023 Marlhy', '2023 STMPD RCRDS B.V.', '2023 Marlhy', '2023 Marlhy']"}, {"role": "assistant", "content": "{\n  \"reasoning\": \"The recent P-lines feature both 'Marlhy' and 'STMPD RCRDS B.V.'. While 'STMPD RCRDS' may indicate involvement with a label by that name, the majority of P-lines, as well as the most recent one, simply indicate 'Marlhy' which is the artist's name. It is likely Marlhy release one single with 'STMPD RCRDS' but has since moves back to being independent, as indicated by the most recent P-line. Therefore 'Marlhy' is likely unsigned.\",\n  \"signed\": \"no\",\n  \"rights_holder\": \"\"\n}"}, {"role": "user", "content": "Artist: Halflives \n\nRecent P-Lines:\n['2017 Halflives', '2023 Halflives under exclusive license to Still Standing Group', '2022 Halflives under exclusive license to Still Standing Group', '2022 Halflives under exclusive license to Still Standing Group']"}, {"role": "assistant", "content": "{\n  \"reasoning\": \"The recent P-Lines clearly indicate that the copyrights are attributed to 'Halflives under exclusive license to Still Standing Group.' This implies that Halflives is signed to the label 'Still Standing Group' under an exclusive license. The presence of a specific record label in the copyright indicates that Halflives is signed.\",\n  \"signed\": \"yes\",\n  \"rights_holder\": \"Still Standing Group\"\n}"}, {"role": "user", "content": "Artist: Story Of The Year \n\nRecent P-Lines:\n['2023 SHARPTONE', '2017 Story of the Year', '2013 Story Of The Year', '2010 Epitaph']"}, {"role": "assistant", "content": "{\n  \"reasoning\": \"The recent copyright lines mention '2023 SHARPTONE' and '2017 Story of the Year', indicating a major record label (SHARPTONE) and the artist's own name (Story of the Year). This suggests that Story of the Year is likely signed to a major or indie record label named SHARPTONE.\",\n  \"signed\": \"yes\",\n  \"rights_holder\": \"SHARPTONE\"\n}"}, {"role": "user", "content": "Artist: Morgan Wallen \n\nRecent P-Lines:\n['\u2117 2023 Big Loud Records, under exclusive license to Mercury Records/Republic Records, a division of UMG Recordings, Inc.', '\u2117 2021 Big Loud Records, under exclusive license to Republic Records, A division of UMG Recordings, Inc.', '\u2117 2020 Big Loud Records, under exclusive license to Republic Records, A division of UMG Recordings, Inc.', '2018 Big Loud Records']"}, {"role": "assistant", "content": "{\n  \"reasoning\": \"The copyright lines for Morgan Wallen's recent releases all point to major record labels, including Big Loud Records, Republic Records, and UMG Recordings, Inc. This makes it clear that Morgan Wallen is signed to a major label.\",\n  \"signed\": \"yes\",\n  \"rights_holder\": \"Big Loud Records, Republic Records, UMG Recordings, Inc\"\n}"}, {"role": "user", "content": "Artist: Corey Kent \n\nRecent P-Lines:\n['(P) 2023 Sony Music Entertainment. All rights reserved.', '(P) 2023 Sony Music Entertainment. All rights reserved.', '2021 Combustion Masters', '2020 Combustion Music']"}, {"role": "assistant", "content": "{\n  \"reasoning\": \"The recent P-lines show that the copyrights are attributed to 'Sony Music Entertainment'. This indicates that Corey Kent is signed to a major record label.\",\n  \"signed\": \"yes\",\n  \"rights_holder\": \"Sony Music Entertainment\"\n}"}, {"role": "user", "content": "Artist: Gabby Barrett \n\nRecent P-Lines:\n['\u2117 2020, 2021 Warner Music Nashville LLC', '\u2117 2021 Warner Music Nashville LLC', '\u2117 2020 Warner Music Nashville LLC', '\u2117 2024 Warner Music Nashville LLC']"}, {"role": "assistant", "content": "{\n  \"reasoning\": \"The recent copyright lines all include 'Warner Music Nashville LLC', a major record label. This strongly suggests that Gabby Barrett is signed to a record label, specifically Warner Music Nashville LLC.\",\n  \"signed\": \"yes\",\n  \"rights_holder\": \"Warner Music Nashville LLC\"\n}"}, {"role": "user", "content": "Artist: Conner Smith \n\nRecent P-Lines:\n['\u2117 2024 Big Machine Label Group, LLC', '\u2117 2023 Big Machine Label Group, LLC', '\u2117 2024 Big Machine Label Group, LLC', '\u2117 2023 Big Machine Label Group, LLC']"}, {"role": "assistant", "content": "{\n  \"reasoning\": \"The recent P-Lines indicate that Conner Smith's releases are copyrighted to 'Big Machine Label Group, LLC'. This is a major record label, indicating that Conner Smith is signed to a label.\",\n  \"signed\": \"yes\",\n  \"rights_holder\": \"Big Machine Label Group, LLC\"\n}"}, {"role": "user", "content": "Artist: Drew Green \n\nRecent P-Lines:\n['2024 Drew Green', '2023 Drew Green', '2023 Boom Music / ORINDA', '2023 Boom Music / ORINDA, distributed by Cinq Music Group']"}, {"role": "assistant", "content": "{\n  \"reasoning\": \"The recent copyright lines for Drew Green's releases include 'Boom Music / ORINDA' and 'Cinq Music Group'. These are indicative of a label or distribution company, However, his 2 most recent p-lines have no mention of these entities, and reference only the artist. Therefore it is likely his deal with these labels is over and he is currently not signed.\",\n  \"signed\": \"no\",\n  \"rights_holder\": \"\"\n}"}, {"role": "user", "content": "Artist: Trevor Martin \n\nRecent P-Lines:\n['2023 Go-To Creations', '2023 Go-To Creations', '2023 Trevor Martin', '2023 Trevor Martin']"}, {"role": "assistant", "content": "{\n  \"reasoning\": \"The recent P-lines indicate that the copyrights are attributed to 'Go-To Creations' and 'Trevor Martin'. 'Go-To Creations' may be an indie record label, and is referenced in the most recent p-lines. This indicates Trevor Martin may have recently signed with 'Go-To Creations' and is therefore signed.\",\n  \"signed\": \"yes\",\n  \"rights_holder\": \"Go-To Creations\"\n}"},
        {'role': 'user', 'content': f"Artist: {name} \n\nRecent P-Lines:\n{plines}"}
    ]
    try:
    # run LLM eval
      completion = self.client.chat.completions.create(
        model="gpt-3.5-turbo-1106",
        messages=training_messages,
        response_format={ "type": "json_object" }
      )
      message = completion.choices[0].message.content
    except Exception as e:
      raise ErrorResponse("Call to OpenAI Failed", 500)
    
    try:
      data = json.loads(message)
    except:
      raise ErrorResponse("Model response was not parsable json", 500)
  
    return data

def eval_spotify_rights(p_line, artist_name):
    p_line = p_line.lower().strip()
    artist_name = artist_name.lower().strip()
    for key in SP_MAJOR_KEYWORDS:
       if key in p_line:
          return key, "Major"
    for key in SP_KNOWN_INDIE_KEYWORDS:
       if key in p_line:
          return key, "Indie"
    for key in SP_SIGNED_KEYWORDS:
       if key in p_line:
          return "N/A", "Indie"
    for key in SP_DIY_KEYWORDS:
       if key in p_line:
          return key, "DIY"
       
    if artist_name in p_line:
      return "N/A", "DIY"

    return "N/A", "Unknown"
   

def eval_youtube_rights(artist_name, yt_description):
    # print(yt_description)
    lines = yt_description.split('\n')

    distributor = 'N/A'
    pline = 'N/A'

    for line in lines:
        if 'Provided to YouTube by ' in line:
            distributor = line.split('Provided to YouTube by ')[1]
        if '℗' in line:
            l = line.split('℗ ')[1]
            if 'under exclusive license to ' in l:
                pline = l.split('under exclusive license to ')[1]
            else:
                pline = l
            pline = re.sub(r'\b\d{4}\b', '', pline).strip()


    distro_type = 'Indie'

    # if the distro looks like the artist name
    if fuzzy_equal(artist_name, distributor, 80):
        distro_type = 'DIY'
        distributor = 'N/A'
        return distributor, pline, distro_type


    for distro in YT_DIY_DISTROS:
        if fuzzy_equal(distro, distributor):
            distributor = distro
            distro_type = 'DIY'
            return distributor, pline, distro_type
    
    for distro in YT_MAJOR_DISTROS:
        if fuzzy_equal(distro, distributor):
            distributor = distro
            distro_type = 'Major'
            return distributor, pline, distro_type

    for distro in YT_KNOWN_INDIE_DISTROS:
        if fuzzy_equal(distro, distributor):
            distributor = distro
            distro_type = 'Indie'
            return distributor, pline, distro_type
        
    # we found something we just don't know what it is
    if distributor != "N/A" or pline != "N/A":
        distro_type = 'Indie'
        return distributor, pline, distro_type
    # we didn't see anything legit looking but can't confirm
    else:
        return distributor, pline, 'Unknown'


def fuzzy_equal(s1, s2, threshold=80):
    s1 = s1.lower().strip()
    s2 = s2.lower().strip()
    sim = fuzz.partial_ratio(s1, s2)
    return sim > threshold


def is_probably_same_track(youtube_video_title, spotify_song_title, youtube_channel_title, spotify_artist_name, threshold=80):
    return fuzzy_equal(youtube_channel_title, spotify_artist_name, threshold) and fuzzy_equal(youtube_video_title, spotify_song_title, threshold)