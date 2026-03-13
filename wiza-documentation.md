Using the API
Authorization
Authenticate your API requests with Bearer token

All Wiza API requests require authentication using a Bearer token. Include your API key in the Authorization header of every request.
​
Header Format
Authorization: Bearer YOUR_API_KEY
​
Examples

curl

JavaScript

Python

Ruby
curl -X POST https://wiza.co/api/individual_reveals \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "individual_reveal": {
      "profile_url": "https://www.linkedin.com/in/example/"
    },
    "enrichment_level": "partial"
  }'
​
Error Responses
​
401 Unauthorized
Returned when the API key is missing, invalid, or expired.
{
  "status": {
    "code": 401,
    "message": "Unauthorized"
  }
}
Common causes:
Missing Authorization header
Invalid API key format (must be Bearer YOUR_API_KEY)
API key has been disabled
API key does not exist
​
Related
Generate an API Key - Create your API key
API Key Management - Manage and rotate keys
Status Codes & Errors - Full error reference





Recommended Inputs
Best practices for input data to maximize results

For the /api/individual_reveals endpoint, provide one of the following input options per request. Different inputs offer varying levels of coverage and accuracy and are listed below from highest to lowest.
LinkedIn URL (strongly recommended) - Provides the highest performing results
Full name + company domain and/or company name - Including a company domain improves match accuracy, as domains are unique while company names may have duplicates. This option provides the next best-performing results.
Email address - Use only if other input options are unavailable
​
Payload Examples
​
Option 1: LinkedIn URL
{
  "individual_reveal": {
    "profile_url": "https://www.linkedin.com/in/stephen-hakami-5babb21b0/"
  },
  "enrichment_level": "partial"
}
​
Option 2: Full Name + Company Domain
{
  "individual_reveal": {
    "full_name": "Stephen Hakami",
    "domain": "wiza.co"
  },
  "enrichment_level": "partial"
}
​
Option 2b: Full Name + Company Name
{
  "individual_reveal": {
    "full_name": "Stephen Hakami",
    "company": "Wiza"
  },
  "enrichment_level": "partial"
}
​
Option 3: Email Address
{
  "individual_reveal": {
    "email": "stephen@wiza.co"
  },
  "enrichment_level": "partial"
}






"Using the API
Find Email Addresses
Find work and personal email addresses

Wiza may return one work email and one personal email per profile.
​
Step 1: Start Individual Reveal
Endpoint: https://wiza.co/api/individual_reveals
Send a POST request with your API key, setting "enrichment_level": "partial" to retrieve emails. Use the email_options object to specify whether you want to find work emails, personal emails, or both. The response will include an id, which you will use in Step 2.
"accept_work": true → include work emails
"accept_personal": true → include personal emails
Setting a value to false indicates that you do not want to retrieve that type of email.
Requests for work emails may take 0 - 380 seconds to process, with an average response time of ~25 seconds. Requests for personal emails may take 0 - 15 seconds to process, with an average response time of ~4 seconds.
Sample Request Body:
{
  "individual_reveal": {
    "profile_url": "https://www.linkedin.com/in/stephen-hakami-5babb21b0/"
  },
  "enrichment_level": "partial",
  "email_options": {
    "accept_work": true,
    "accept_personal": false
  }
}
​
Step 2: Retrieve Reveal Results
Endpoint: GET https://wiza.co/api/individual_reveals/{id}
Use the id returned from Step 1 to access the enriched data. For best results, parse email, email_type, and email_status from the emails array. Multiple emails may be returned per profile.
Alternatively, if a webhook is configured, the completed reveal will be delivered automatically."
it also has linkedin one "Find LinkedIn Profile Information
Get detailed LinkedIn profile data

​
Step 1: Start Individual Reveal
Endpoint: POST https://wiza.co/api/individual_reveals
Send a POST request with your API key and set "enrichment_level": "none" to retrieve LinkedIn profile information.
Wiza retrieves this data in real-time and returns the fields listed under LinkedIn Profile Information and Company Information in the Data Dictionary.
Not all data points are included by default. To include additional LinkedIn attributes, go to Settings → Data & Export → Advanced Columns and enable the desired fields.
The request may take 0 - 15 seconds to process, with an average response time of ~5 seconds. The response will include an id, which you will use in Step 2 to retrieve the enriched LinkedIn profile data.
​
Step 2: Retrieve LinkedIn Profile Results
Endpoint: GET https://wiza.co/api/individual_reveals/{id}
Use the id returned from Step 1 to access the enriched data. LinkedIn profile and company information associated with the profile will be returned.
Alternatively, if a webhook is configured, the completed reveal will be delivered automatically."

