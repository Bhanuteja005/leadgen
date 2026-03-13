
Pricing
Features
Integrations
API
Login

Introduction
Getting Started
User Guide

API Documentation

API Usage

Single Validation API
Bulk Validation API

Upload a Bulk list
Start Verifying Bulk List
Check Job Status
Download Verification Result
Delete a Bulk Email List
Get Credit Balance
FAQ

API DocumentationBulk Validation APIUpload a Bulk list
Upload a bulk email list
POST https://api.bouncify.io/v1/bulk

This endpoint allows you to upload a bulk email validation list. It accepts the email data in multiple ways. You can upload email addresses in the CSV file format or an array of objects.

If auto_verify is enabled, this API will create a job and automatically process each email in the uploaded list. If the auto_verify is disabled, the email list is prepared and ‘ready’ for verification, you can start verification using start endpoint. The API response does not contain the verification results. Instead it returns the job_id in the success response. Once the verification is completed, you can download the result using this job_id.

Option 1: CSV file
This endpoint accepts the file in .csv (comma separated values) format. The supported size of the file is 10Mb. The number of emails in a file must be within 5 lakhs. The additional columns in the csv file will be retained.

Option 2: Array of emails
Instead of having to write to a file, you can dynamically create email lists on the fly when you provide the data directly. The array of objects contains the ‘email’ field as well as any additional data you want to include with the email. If the data is provided as an object, the key names will be used for the column headers. Here is an example of an email object in JSON format.

Emails Object

{
    "auto_verify": "true",
    "emails": [
        {
            "email": "test1@example.com",
            "firstname": "John",
            "lastname": "Doe"
        },
        {
            "email": "test2@example.com",
            "firstname": "Daniel",
            "lastname": "Jay"
        }
    ]
}

Limits
Our API supports having up to 500 unverified lists in an account, with a maximum of 100 lists allowed for active verification concurrently.

Request Parameters
Parameter	Type	Required	Description
apikey	string	Required	Your API key
local_file	file	Required	The file to be upload in .csv format
auto_verify	boolean	Optional	Auto verify allows to start verification instantly. Defaults to false.
RAW_BODY	json	Required	The emails to be verified
Successful Response
JSON

HTTP/1.1 200 OK
{
   "job_id": "r374aki32rnatv868nntpxloc7dkilszc3eu",
   "success": true,
      "message": "Bulk email verification list has been created"
}

Response Parameters
Parameter	Type	Description
job_id	string	The job_id corresponding to the list you have been created
success	[true, false]	Whether the API request call was successful or not.
message	string	Describes API result
Other responses
The response you get when the API key is invalid:

HTTP/1.1 401 Unauthorized
{
      "result":"Invalid API Key",
   "success": false
}

The response you get when the auto_verify is enabled:

HTTP/1.1 200 OK
{
   "job_id": "r374aki32rnatv868nntpxloc7dkilszc3eu",
   "success": true,
      "message": "Bulk email verification list has been created and starts verification shortly"
}

The response you get when you provide the incorrect file format:

HTTP/1.1 400 BadRequest
{
   "result": "Invalid file data",
   "success": false
}

The response you get when you reach the limit of maximum list uploads.

HTTP/1.1 400 BadRequest
{
    "success": false,
    "message": "The maximum number of lists has been reached."
}

The response you get when you reach the limit of concurrent list verifications.

HTTP/1.1 400 BadRequest
{
    "success": false,
    "message": "The maximum number of active verification lists has been reached."
}

Example
Python / PHP / Node / Ruby / Shell

curl --request POST \
     --url https://api.bouncify.io/v1/bulk \
     --header 'accept: application/json' \
     --header 'content-type: application/json'

Previous
Bulk Validation API


API DocumentationBulk Validation APIStart Verifying Bulk List
Start verifying bulk email list
PATCH https://api.bouncify.io/v1/bulk

Request Parameters
Parameter	Type	Required	Description
job_id	string	Required	The jobId corresponding to the list you need to start verification
apikey	string	Required	Your API key
RAW_BODY	json	Required	The required action to start the verification. Defaults to { "action" : "start" }.
Successful Response
JSON

HTTP/1.1 200 OK
{
    "job_id": "r374aki32rnatv868nntpxloc7dkilszc3eu",
    "success": true,
    "message": "Job verification will be attempted shortly. Call /status endpoint to know the status of the Job"
}


Response parameters
Parameter	Type	Definition
job_id	string	The job_id corresponding to the list you need to start verification
success	[true, false]	Whether the API request call was successful or not.
message	string	Describes the start result
caution
The verification once started cannot be paused, stopped, cancelled or restart the same list.

Other Responses
The response you get when the API key is invalid:

HTTP/1.1 401 Unauthorized
{
      "result":"Invalid API Key",
   "success": false
}

The response you get when you provide invalid job_id:

HTTP/1.1 400 BadRequest
{
    "result": "Job not found. Invalid jobId",
    "success": false
}

The response you get when you account is under review or restricted:

HTTP/1.1 400 BadRequest
{
    "result": "Verify restricted",
    "success": false
}

The response you get when the verification already started:

HTTP/1.1 400 BadRequest
{
    "result": "Verification has already started.",
    "success": false
}

The response you get when you have insufficient credit to begin verification:

HTTP/1.1 402 Payment Required
{
    "result": "Insufficient verification credits. Please order a plan.",
    "success": false
}

The response you get when the job not found:

HTTP/1.1 400 BadRequest
{
    "result": "Job not found.",
    "success": false
}

The response you get when then job is preparing for verification:

HTTP/1.1 400 BadRequest
{
    "result": "Job is not ready for verification, please call the /status endpoint and start verification once the status of the job turns to ready.",
    "success": false
}


Example
Python / Go / PHP / Ruby / Shell

curl --request PATCH \
     --url https://api.bouncify.io/v1/bulk \
     --header 'accept: application/json' \
     --header 'content-type: application/json' \
     --data '{"action":"start"}'

Previous
Upload a Bulk list


Check job status of a bulk email list
GET https://api.bouncify.io/v1/bulk

Request Parameters
Parameter	Type	Required	Description
job_id	string	Required	The jobId corresponding to the list you need to check status
apikey	string	Required	Your API key
Successful Response
JSON

HTTP/1.1 200 OK
{
    "job_id": "r374aki32rnatv868nntpxloc7dkilszc3eu",
    "status": "completed",
    "created_at": "08/13/2021, 9:39:37 AM",
    "total": 2,
    "verified": 2,
    "pending": 0,
    "analysis": {
        "common_isp": 1,
        "role_based": 1,
        "disposable": 0,
        "spamtrap": 0,
        "syntax_error": 0
    },
    "results": {
        "deliverable": 1,
        "undeliverable": 0,
        "accept_all": 1,
        "unknown": 0
    },
    "success": true,
    "message": "Verification completed successfully. Please download the result using /download endpoint"
}

Response parameters
Parameter	Type	Definition
job_id	string	The job_id corresponding to the list you need to check the status
status	string	The status of the list
created_at	date time	The date and time in which the list has been created
total	Integer	The total number of emails the list has
verified	Integer	The number of emails are verified
pending	Integer	The number of emails need to be verified
common_isp	[0, 1]	Whether the email is considered a role address. (e.g. "sales@, info@, help@, etc.)
role_based	[0, 1]	Whether the email is hosted by a free email provider like Gmail, Yahoo!, Hotmail etc..
disposable	[0, 1]	Whether this is a temporary email.
spamtrap	[0, 1]	Is this a honey-trap email
syntax_error	[0, 1]	Whether the email is syntactically incorrect
deliverable	Integer	These emails are valid and safe to send mail.
undeliverable	Integer	Sending mails will result in bounce.
accept_all	Integer	Remote host accepts mail at any address.
unknown	Integer	Unable to definitively verify these emails as their mail servers were not reachable during verification.
success	[true, false]	Whether the API request call was successful or not.
message	string	Describes API result
Other Responses
The response you get when the API key is invalid:

HTTP/1.1 401 Unauthorized
{
      "result":"Invalid API Key",
   "success": false
}

The response you get when you provide invalid job_id:

HTTP/1.1 400 BadRequest
{
    "result": "Job not found. Invalid jobId",
    "success": false
}

The response you get still the job is preparing:

HTTP/1.1 200 OK
{
    "job_id": "r374aki32rnatv868nntpxloc7dkilszc3eu",
    "status": "preparing",
    "created_at": "08/13/2021, 9:39:37 AM",
    "success": true,
    "message": "Job is being prepared for verification"
}

The response you get when the list is ready for verification:

HTTP/1.1 200 OK
{
    "job_id": "r374aki32rnatv868nntpxloc7dkilszc3eu",
    "status": "ready",
    "created_at": "08/13/2021, 9:39:37 AM",
    "total": 2,
    "analysis": {
        "common_isp": 1,
        "role_based": 1,
        "disposable": 0,
        "spamtrap": 0,
        "syntax_error": 0
    },
    "success": true,
    "message": "Job ready for verification. Please begin verification to know the result"
}

The response you get when the list is in verifying status:

HTTP/1.1 200 OK
{
    "job_id": "r374aki32rnatv868nntpxloc7dkilszc3eu",
    "status": "verifying",
    "created_at": "08/13/2021, 9:39:37 AM",
    "total": 2,
    "verified": 1,
    "pending": 1,
    "analysis": {
        "common_isp": 1,
        "role_based": 1,
        "disposable": 0,
        "spamtrap": 0,
        "syntax_error": 0
    },
    "results": {
        "deliverable": 1,
        "undeliverable": 0,
        "accept_all": 1,
        "unknown": 0
    },
    "success": true,
    "message": "Job is being verified"
}

The response you get when the job failed:

HTTP/1.1 200 OK
{
    "job_id": "565ad4aki32rnqweqaefwdaosjc7dksdaksd",
    "status": "failed",
    "created_at": "08/03/2021, 3:35:32 PM",
    "total": 0,
    "success": true,
    "message": "Unable to process your job, The uploaded list contains invalid data"
}

The response you get when the job is cancelled:

HTTP/1.1 200 OK
{
    "job_id": "asdfcqkahs37e2137wh273yhen283ye0js23",
    "status": "cancelled",
    "created_at": "08/05/2021, 12:07:21 PM",
    "total": 4,
    "success": true,
    "message": "Job is cancelled"
}

The response you get when the job not found:

HTTP/1.1 400 BadRequest
{
    "result": "Job not found",
    "success": false
}

Example
Go / PHP / Python / Ruby / Shell

curl --request GET \
     --url https://api.bouncify.io/v1/bulk \
     --header 'accept: application/json'

     Download the result of bulk email list
POST https://api.bouncify.io/v1/download

Request Parameters
Parameter	Type	Required	Description
jobId	string	Required	The job_id corresponding to the list you need to download
apikey	string	Required	Your API key
RAW_BODY	json	Optional	Provide the results type to include in the download file. Defaults to { "filterResult":["deliverable", "undeliverable", "accept_all", "unknown"] }
Successful Response
Text

"Email", "Verification Result",	"Syntax Error",	"ISP", "Role", "Disposable", "Trap", "Verified At" "info@sample.com", "deliverable", "N", "Y", "N", "N", "N", "2021-09-13T06:49:39.280Z" "support@sample.in", "accept-all", "N",	"N", "Y", "Y", "N", "2021-09-13T06:49:39.282Z"


Response Parameters
Parameter	Type	Description
Email	email	The email that was verified.
Verification Result	string	The verified results will be: deliverable, undeliverable, unknown, accept-all
Verified At	date time	The time at which the email is verified
Syntax Error	[0, 1]	Whether the email is syntactically incorrect
ISP	[0, 1]	Whether the email is considered a role address. (e.g. "sales@, info@, help@, etc.)
Role	[0, 1]	Whether the email is hosted by a free email provider like Gmail, Yahoo!, Hotmail etc..
Disposable	[0, 1]	Whether this is a temporary email.
Trap	[0, 1]	Is this a honey-trap email
Other Responses
The response you get when the API key is invalid:

HTTP/1.1 401 Unauthorized
{
      "result":"Invalid API Key",
   "success": false
}

The response you get when you provide invalid job_id:

HTTP/1.1 400 BadRequest
{
    "result": "Job not found. Invalid jobId",
    "success": false
}

The response you get when your account is under review or restricted:

HTTP/1.1 400 BadRequest
{
    "result": "DOWNLOAD-RESTRICTED",
    "success": false
}

The response you get when you passed the invalid job_id:

HTTP/1.1 400 BadRequest
{
    "result": "Job not found. Invalid jobId",
    "success": false
}

The response you get when you passed the incorrect filter result options:

HTTP/1.1 400 BadRequest
{
  "result": "Invalid filterResult. Please provide correct filterResult options",
  "success": false
}

The response you get when the job is still verifying:

HTTP/1.1 400 BadRequest
{
  "result": "Job is being verified, please wait until it completes.",
  "success": false
}

The response you get when the job is ready to begin verification:

HTTP/1.1 400 BadRequest
{
  "result": "Job is ready for verification, please start verification and download your results once list verified.",
  "success": false
}


The response you get when the job is still being preparing for verification:

HTTP/1.1 400 BadRequest
{
  "result": "Job is being prepared for verification, please start verifying and then download you result.",
  "success": false
}

The response you get when the uploaded list contains invalid data:

HTTP/1.1 400 BadRequest
{
  "result": "List cannot be downloaded, The uploaded list contains invalid data.",
  "success": false
}

The response you get when the job not available:

HTTP/1.1 400 BadRequest
{
  "result": "Job not found.",
  "success": false
}

Example
Python / Go / PHP / Ruby / Shell

curl --request POST \
     --url https://api.bouncify.io/v1/download \
     --header 'accept: text/plain' \
     --header 'content-type: application/json' \
     --data '
{
  "filterResult": [
    "deliverable",
    "undeliverable",
    "accept_all",
    "unknown"
  ]
}
'Delete a bulk email list
DELETE https://api.bouncify.io/v1/bulk

List deletion cannot be undone
The list and its results once deleted cannot recovered back. If the lists and results are needed, you need to upload and verify the list again.

Request Parameters
Parameter	Type	Required	Description
job_id	string	Required	Your list's jobId, you needs to delete
apikey	string	Required	API key
Successful Response
JSON

HTTP/1.1 200 OK
{
    "job_id": "r374aki32rnatv868nntpxloc7dkilszc3eu",
    "success": true,
    "message": "List will be deleted"
}

Response Parameters
Parameter	Type	Definition
job_id	string	Your list's jobId, you needs to delete
success	[true, false]	Whether the API request call was successful or not.
message	string	Describes API result
Other Responses
The response you get when the API key is invalid:

HTTP/1.1 401 Unauthorized
{
      "result":"Invalid API Key",
   "success": false
}

The response you get when you provide invalid job_id:

HTTP/1.1 400 BadRequest
{
    "result": "Job not found. Invalid jobId",
    "success": false
}

The response you get when the list is still processing:

HTTP/1.1 400 BadRequest
{
    "result": "List is being processed, and cannot be deleted.",
    "success": false
}

The response you get when the list not found:

HTTP/1.1 400 BadRequest
{
    "result": "List not found, may be already deleted.",
    "success": false
}

Example
Go / Python / PHP / Ruby / Shell

curl --request DELETE \
     --url https://api.bouncify.io/v1/bulk \
     --header 'accept: application/json'